/**
 * Phase 5: compare independent CSI reference outputs against normalized NexFEM outputs.
 * This script intentionally does NOT infer CSI modeling conventions or generate reference data.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const keyOf = (m) => [m.case, m.kind, m.object, m.component].join("|");
function indexMetrics(doc, role) {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.metrics)) throw new Error(`${role}: metrics[] required`);
  if (!doc.units || typeof doc.units !== "object") throw new Error(`${role}: explicit units required`);
  const index = new Map();
  for (const metric of doc.metrics) {
    for (const field of ["case", "kind", "object", "component"]) {
      if (typeof metric[field] !== "string" || !metric[field]) throw new Error(`${role}: missing ${field}`);
    }
    if (typeof metric.value !== "number" || !Number.isFinite(metric.value))
      throw new Error(`${role}: invalid numeric value for ${keyOf(metric)}`);
    const key = keyOf(metric);
    if (index.has(key)) throw new Error(`${role}: duplicate metric ${key}`);
    index.set(key, metric);
  }
  return index;
}

export function compareNormalized(reference, observed) {
  const expected = indexMetrics(reference, "reference");
  const actual = indexMetrics(observed, "observed");
  if (JSON.stringify(reference.units) !== JSON.stringify(observed.units))
    throw new Error("Units mismatch: normalize both sources to the same explicit units before comparison");
  if (!reference.source?.program || !reference.source?.version)
    throw new Error("Reference program and version are required");
  const rows = [];
  for (const [key, r] of expected) {
    if (!Number.isFinite(r.absTolerance) || r.absTolerance < 0 ||
        !Number.isFinite(r.relTolerance) || r.relTolerance < 0)
      throw new Error(`Missing/invalid per-metric tolerance: ${key}`);
    const a = actual.get(key);
    if (!a) {
      rows.push({ key, status: "missing", reference: r.value });
      continue;
    }
    const absError = Math.abs(a.value - r.value);
    const relativeError = r.value === 0 ? null : absError / Math.abs(r.value);
    const allowed = Math.max(r.absTolerance, r.relTolerance * Math.abs(r.value));
    rows.push({ key, status: absError <= allowed ? "pass" : "fail", reference: r.value,
      actual: a.value, absError, relativeError, allowed });
  }
  for (const [key, a] of actual) {
    if (!expected.has(key)) rows.push({ key, status: "unexpected", actual: a.value });
  }
  const totals = { pass: 0, fail: 0, missing: 0, unexpected: 0 };
  for (const row of rows) totals[row.status] += 1;
  return { source: reference.source, units: reference.units, totals,
    passed: totals.fail === 0 && totals.missing === 0 && totals.unexpected === 0 && totals.pass > 0,
    rows };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , refPath, observedPath, reportPath] = process.argv;
  if (!refPath || !observedPath) {
    console.error("Usage: node scripts/validation/compare-csi.mjs reference.json nexfem.json [report.json]");
    process.exitCode = 2;
  } else {
    try {
      const result = compareNormalized(
        JSON.parse(await readFile(refPath, "utf8")),
        JSON.parse(await readFile(observedPath, "utf8")),
      );
      if (reportPath) await writeFile(reportPath, JSON.stringify(result, null, 2) + "\n", "utf8");
      console.log(JSON.stringify({ passed: result.passed, totals: result.totals, source: result.source }, null, 2));
      if (!result.passed) process.exitCode = 1;
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 2;
    }
  }
}
