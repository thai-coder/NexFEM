/** Fixed-fixture load balance and import audit. Does not solve a blocked model. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { importS2k, parseS2k } from "../../packages/io-formats/src/index.ts";
import { compareNormalized } from "./compare-csi.mjs";

const [, , input, out] = process.argv;
if (!input || !out) throw new Error("Usage: node --experimental-transform-types scripts/validation/sap-platform-m2.mjs model.s2k output-dir");
const sourceSha256 = "60ee53086250bd226acf10c5ae7cdefee138ea49da83ef10dcdc4df1a528a013";
const raw = readFileSync(input);
if (createHash("sha256").update(raw).digest("hex") !== sourceSha256) {
  throw new Error("Expected pinned Platform 2nd use.s2k");
}
const reference = JSON.parse(readFileSync(join(out, "reference.json"), "utf8"));
const parsed = parseS2k(raw.toString("utf8"));
const table = (name) => (parsed.tables.get(name) ?? []).map(({ fields }) => fields);
const { model, report } = importS2k(parsed, { name: "Platform M2" });
const caseRows = table("LOAD CASE DEFINITIONS");
const cases = caseRows.filter((row) => row.get("Type") === "LinStatic").map((row) => row.get("Case"));
const patterns = table("LOAD PATTERN DEFINITIONS");
const staticAssignments = table("CASE - STATIC 1 - LOAD ASSIGNMENTS");
const explicitComboRows = table("COMBINATION DEFINITIONS");
const resultTables = ["Base Reactions", "Joint Displacements", "Joint Reactions", "Element Forces - Frames"];
const sourceCases = caseRows.map((row) => row.get("Case")).sort();
for (const name of resultTables) {
  const exportedCases = Object.keys(reference.tables[name].rowsByCase).sort();
  if (JSON.stringify(exportedCases) !== JSON.stringify(sourceCases)) {
    throw new Error(`${name}: output cases differ from S2K (${exportedCases.join(", ")})`);
  }
}
if (JSON.stringify([...cases].sort()) !== JSON.stringify(Object.keys(reference.staticBaseReactionsKip).sort())) {
  throw new Error("Base Reactions: linear-static cases differ from S2K");
}
const axes = ["GlobalFX", "GlobalFY", "GlobalFZ"];
const force = ["FX", "FY", "FZ"];
const moments = ["MX", "MY", "MZ"];
const number = (row, key) => {
  const value = row?.get(key);
  if (!value?.trim() || !Number.isFinite(Number(value))) throw new Error(`Invalid ${key}`);
  return Number(value);
};
const load = Object.fromEntries(cases.map((name) => [name, [0, 0, 0]]));
const area = new Map(table("CONNECTIVITY - AREA").map((row) => [row.get("Area"), number(row, "AreaArea")]));
const weight = table("MATERIAL LIST 1 - BY OBJECT TYPE").reduce((sum, row) => sum + number(row, "TotalWeight"), 0);
const components = { DEAD: {}, LIVE: {} };

for (const name of cases) {
  const assignments = staticAssignments.filter((row) => row.get("Case") === name);
  const [assignment] = assignments;
  if (assignments.length !== 1 || assignment.get("LoadType") !== "Load pattern" ||
      assignment.get("LoadName") !== name || number(assignment, "LoadSF") !== 1) {
    throw new Error(`Unexpected case definition: ${name}`);
  }
  const pattern = patterns.find((row) => row.get("LoadPat") === name);
  const selfWeight = number(pattern, "SelfWtMult") * weight;
  load[name][2] -= selfWeight;
  if (name in components) components[name].selfWeightKip = selfWeight;
}

for (const name of ["AREA LOADS - UNIFORM", "AREA LOADS - UNIFORM TO FRAME"]) {
  for (const row of table(name)) {
    const pattern = row.get("LoadPat");
    const surface = area.get(row.get("Area"));
    if (!(pattern in components) || surface === undefined ||
        row.get("CoordSys") !== "GLOBAL" || row.get("Dir") !== "Gravity") {
      throw new Error(`Unexpected area load in ${name}`);
    }
    const magnitude = surface * number(row, "UnifLoad");
    load[pattern][2] -= magnitude;
    const totals = components[pattern];
    totals[name] = (totals[name] ?? 0) + magnitude;
  }
}

const seismic = {};
const seismicMoments = {};
const mappedRows = [["case", "elementJoint", "objectJoint", "nexfemJoint", "fx_kip", "fy_kip",
  "fz_kip", "mx_kip_in", "my_kip_in", "mz_kip_in", "x_in", "y_in", "z_in"]];
for (const row of table("AUTO SEISMIC LOADS TO JOINTS")) {
  const name = row.get("LoadPat");
  if (!["EQX", "EQY"].includes(name)) throw new Error(`Unexpected seismic pattern: ${name}`);
  const summary = seismic[name] ??= { rows: 0, mappedRows: 0, unmappedRows: 0, unmappedNonzeroRows: 0, unmappedForceKip: [0, 0, 0] };
  const joint = row.get("Joint");
  const target = joint && Object.hasOwn(report.mapping.joints, joint) ? report.mapping.joints[joint] : "";
  const values = [...force, ...moments].map((key) => number(row, key));
  const xyz = ["X", "Y", "Z"].map((key) => number(row, key));
  const lever = xyz.map((value, axis) => value - reference.staticBaseMoments[name].originIn[axis]);
  const moment = seismicMoments[name] ??= [0, 0, 0];
  moments.forEach((_, axis) => {
    const j = (axis + 1) % 3;
    const k = (axis + 2) % 3;
    moment[axis] += values[axis + 3] + lever[j] * values[k] - lever[k] * values[j];
  });
  summary.rows++;
  if (target) {
    summary.mappedRows++;
  } else {
    summary.unmappedRows++;
    if (values.some((value) => value !== 0)) summary.unmappedNonzeroRows++;
    force.forEach((_, axis) => { summary.unmappedForceKip[axis] += values[axis]; });
  }
  force.forEach((_, axis) => { load[name][axis] += values[axis]; });
  mappedRows.push([name, row.get("JointElem"), joint ?? "", target, ...values, ...xyz]);
}
const csvRow = (row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",");
writeFileSync(join(out, "seismic-explicit-source.csv"), mappedRows.map(csvRow).join("\n") + "\n");

const metrics = cases.flatMap((name) => axes.map((component) => {
  const value = reference.staticBaseReactionsKip[name][component];
  return { case: name, kind: "force-balance", object: "base", component, value,
    absTolerance: 0.0005, relTolerance: 0 };
}));
const units = { force: "kip" };
const comparison = compareNormalized(
  { source: { program: report.program, version: report.version }, units, metrics },
  { units, metrics: metrics.map(({ case: name, kind, object, component }) =>
    ({ case: name, kind, object, component, value: -load[name][axes.indexOf(component)] })) },
);
const momentMetrics = Object.keys(seismicMoments).flatMap((name) => {
  const { momentKipIn } = reference.staticBaseMoments[name];
  return moments.map((axis, index) => ({
    case: name, kind: "moment-balance", object: "base", component: `Global${axis}`,
    value: momentKipIn[index], absTolerance: 0.0005, relTolerance: 0,
  }));
});
const momentUnits = { moment: "kip-in" };
const momentComparison = compareNormalized(
  { source: comparison.source, units: momentUnits, metrics: momentMetrics },
  { units: momentUnits, metrics: momentMetrics.map((metric) => ({
    ...metric, value: -seismicMoments[metric.case][moments.indexOf(metric.component.slice(-2))],
  })) },
);

const caseCoverage = caseRows.map((row) => {
  const name = row.get("Case");
  const type = row.get("Type");
  if (type !== "LinStatic" && type !== "LinModal") throw new Error(`Unclassified case: ${name} (${type})`);
  const modeNumbers = reference.baseReactionModes[name] ?? [];
  if (type === "LinModal") {
    const definition = table("CASE - MODAL 1 - GENERAL").find((item) => item.get("Case") === name);
    if (modeNumbers.length !== number(definition, "MaxNumModes") ||
        !modeNumbers.every((mode, index) => mode === index + 1)) {
      throw new Error(`Incomplete modal results for ${name}`);
    }
  }
  return {
    name, type,
    assignments: staticAssignments.filter((item) => item.get("Case") === name).map((item) => ({
      pattern: item.get("LoadName"), factor: number(item, "LoadSF"),
    })),
    rowsByTable: Object.fromEntries(resultTables.map((tableName) => [
      tableName, reference.tables[tableName].rowsByCase[name],
    ])),
    modeNumbers,
    sourceForceBalance: type === "LinStatic" ? "compared" : "not applicable",
    sourceMomentBalance: name in seismicMoments ? "compared" : type === "LinStatic" ? "not reconstructed" : "not applicable",
    solverComparison: "not comparable",
  };
});
const result = {
  sourceSha256, program: report.program, version: report.version, sourceUnits: report.units,
  coverage: {
    patterns: patterns.map((row) => ({
      name: row.get("LoadPat"), type: row.get("DesignType"), selfWeight: number(row, "SelfWtMult"),
    })),
    cases: caseCoverage,
    combinations: {
      explicitNames: [...new Set(explicitComboRows.map((row) => row.get("ComboName")))],
      automaticDesignTypes: table("AUTO COMBINATION OPTION DATA 01 - GENERAL")
        .filter((row) => row.get("AutoGen") === "Yes").map((row) => row.get("DesignType")),
      automaticInputs: table("AUTO COMBINATION OPTION DATA 02 - USER DATA").map((row) => ({
        designType: row.get("DesignType"), limitState: row.get("LSType"), case: row.get("LCName"),
      })),
    },
  },
  import: {
    blocked: report.blocked, counts: report.counts, frameSegments: model.frames.length,
    assignedFrameLoads: model.frameLoads.length, assignedJointLoads: model.jointLoads.length,
    diagnostics: report.diagnostics.filter(({ level }) => level !== "info").map(({ objects, ...diagnostic }) => diagnostic),
  },
  sourceCounts: {
    areaElementsInExport: reference.tables["Objects And Elements - Areas"].rowsByCase.all,
    linkProperties: table("LINK PROPERTY DEFINITIONS 01 - GENERAL").length,
    linkConnectivityRows: table("CONNECTIVITY - LINK").length,
  },
  level1: { ...comparison, scope: "SAP2000 source load ledger against independent SAP2000 export; no NexFEM solver", gravityComponentsKip: components },
  seismicMomentBalance: momentComparison,
  level2: { status: "not comparable", explicitSeismic: seismic, solverExecuted: false },
};
writeFileSync(join(out, "platform-m2.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({
  blocked: report.blocked, caseCoverage: caseCoverage.map(({ name }) => name),
  level1: comparison.totals, seismicMomentBalance: momentComparison.totals,
}, null, 2));
