import {
  MODEL_SCHEMA_VERSION,
  parseModel,
  sectionProperties,
  type Frame,
  type FrameLoad,
  type FrameSection,
  type FrameShape,
  type GridSystem,
  type Joint,
  type LoadCase,
  type LoadCombo,
  type LoadPattern,
  type Material,
  type Model,
  type Shell,
  type ShellLoad,
  type ShellSection,
  type Story,
} from "@nexfem/model-core";
import { Diagnostics } from "./diagnostics.ts";
import type { E2kImportResult } from "./e2k-import.ts";
import { parseS2k, s2kNumber, s2kTable, s2kYes, type S2kFile, type S2kRecord } from "./s2k-parse.ts";
import { conv, unitFactors } from "./units.ts";

/**
 * Nhập file SAP2000 `.s2k` / `.$2k` vào mô hình NexFEM (xem docs/csi-import.md).
 * Cùng quy tắc báo cáo với bộ nhập ETABS: mọi dữ liệu không nhập được hoặc nhập gần đúng đều được ghi lại.
 */

/** Bảng được đọc; các bảng còn lại được liệt kê là bỏ qua. */
const TABLES_USED = new Set([
  "PROGRAM CONTROL",
  "DATABASE FORMAT TYPES",
  "ACTIVE DEGREES OF FREEDOM",
  "COORDINATE SYSTEMS",
  "GRID LINES",
  "MATERIAL PROPERTIES 01 - GENERAL",
  "MATERIAL PROPERTIES 02 - BASIC MECHANICAL PROPERTIES",
  "MATERIAL PROPERTIES 03A - STEEL DATA",
  "MATERIAL PROPERTIES 03B - CONCRETE DATA",
  "FRAME SECTION PROPERTIES 01 - GENERAL",
  "AREA SECTION PROPERTIES",
  "JOINT COORDINATES",
  "JOINT RESTRAINT ASSIGNMENTS",
  "CONNECTIVITY - FRAME",
  "CONNECTIVITY - AREA",
  "FRAME SECTION ASSIGNMENTS",
  "FRAME RELEASE ASSIGNMENTS 1 - GENERAL",
  "FRAME RELEASE ASSIGNMENTS 2 - PARTIAL FIXITY",
  "FRAME LOCAL AXES ASSIGNMENTS 1 - TYPICAL",
  "FRAME INSERTION POINT ASSIGNMENTS",
  "FRAME OFFSET ALONG LENGTH ASSIGNMENTS",
  "FRAME PROPERTY MODIFIERS",
  "AREA SECTION ASSIGNMENTS",
  "LOAD PATTERN DEFINITIONS",
  "LOAD CASE DEFINITIONS",
  "CASE - STATIC 1 - LOAD ASSIGNMENTS",
  "COMBINATION DEFINITIONS",
  "FRAME LOADS - DISTRIBUTED",
  "FRAME LOADS - POINT",
  "AREA LOADS - UNIFORM",
  "JOINT LOADS - FORCE",
]);

/** Ngưỡng so đặc trưng tiết diện NexFEM tự tính với giá trị SAP2000 ghi trong file. */
const PROP_TOL = { A: 0.01, I: 0.01, J: 0.05 } as const;

type V3 = [number, number, number];

export function importS2k(input: string | S2kFile, opts: { name?: string } = {}): E2kImportResult {
  const file = typeof input === "string" ? parseS2k(input) : input;
  const d = new Diagnostics();
  // Tên mô hình: tên file lúc lưu ở dòng đầu ("…\24061_OMF.$2k" → "24061_OMF").
  const modelName = file.savedPath.split(/[\\/]/).pop()?.replace(/\.[^.]*$/, "") || "SAP2000";
  const counts: E2kImportResult["report"]["counts"] = {};
  const count = (k: string, source: number, imported: number) => (counts[k] = { source, imported });
  const T = (name: string) => s2kTable(file, name);
  const f = (r: S2kRecord, k: string) => r.fields.get(k);
  const n = (r: S2kRecord, k: string) => s2kNumber(r.fields.get(k));

  // ------------------------------------------------------------------ chương trình, đơn vị
  const pc = T("PROGRAM CONTROL")[0];
  const program = (pc && f(pc, "ProgramName")) ?? "";
  const version = (pc && f(pc, "Version")) ?? "";
  d.add("info", "program", { program: program || "?", version: version || "?" });
  if (program && program.toUpperCase() !== "SAP2000") d.add("warning", "not_sap2000", { program });
  const unitText = pc ? f(pc, "CurrUnits") : undefined;
  const [uf, ul, ut] = (unitText ?? "").split(",").map((s) => s.trim());
  const U = unitText ? unitFactors(uf ?? "", ul ?? "", ut ?? "C") : null;
  const fmt = T("DATABASE FORMAT TYPES")[0];
  if (fmt && f(fmt, "UnitsCurr") && !s2kYes(f(fmt, "UnitsCurr"))) d.add("warning", "units_not_current", {});
  if (!U) {
    d.add("error", unitText ? "unknown_units" : "missing_units", { force: uf ?? "?", length: ul ?? "?" });
    return { model: emptyModel(opts.name ?? modelName), report: { program, version, units: null, counts, diagnostics: d.list(), mapping: { joints: {}, frames: {}, shells: {} } } };
  }
  d.add("info", "unit_conversion", { force: U.force, length: U.length });
  const L = (v: number) => conv.length(U, v);

  // ------------------------------------------------------------------ hệ toạ độ, bậc tự do hoạt động
  for (const r of T("COORDINATE SYSTEMS")) {
    const name = f(r, "Name") ?? "";
    const moved = ["X", "Y", "Z", "AboutZ", "AboutY", "AboutX"].some((k) => (n(r, k) || 0) !== 0);
    if (name.toUpperCase() !== "GLOBAL" || moved) d.add("warning", "coord_system_extra", {}, { line: r.line, object: name });
  }
  const dofNames = ["UX", "UY", "UZ", "RX", "RY", "RZ"] as const;
  const act = T("ACTIVE DEGREES OF FREEDOM")[0];
  const inactive = dofNames.map((k) => (act ? !s2kYes(f(act, k)) && f(act, k) !== undefined : false));
  if (inactive.some(Boolean)) d.add("info", "active_dof_restrained", { dofs: dofNames.filter((_, i) => inactive[i]).join(" ") });

  // ------------------------------------------------------------------ lưới trục; trục Z thành tầng
  const grid: GridSystem = { id: "g-1", name: "GLOBAL", x: [], y: [] };
  const zLines: { label: string; z: number }[] = [];
  for (const r of T("GRID LINES")) {
    const dir = (f(r, "AxisDir") ?? "").toUpperCase();
    const c = n(r, "XRYZCoord");
    const label = f(r, "GridID") ?? "";
    if ((f(r, "CoordSys") ?? "GLOBAL").toUpperCase() !== "GLOBAL" || !Number.isFinite(c)) {
      d.add("warning", "grid_line_skipped", { dir: dir || "?" }, { line: r.line, object: label });
      continue;
    }
    if (dir === "X") grid.x.push({ id: `g-1-x${grid.x.length + 1}`, label, coord: round(L(c)) });
    else if (dir === "Y") grid.y.push({ id: `g-1-y${grid.y.length + 1}`, label, coord: round(L(c)) });
    else if (dir === "Z") zLines.push({ label, z: round(L(c)) });
    else d.add("warning", "grid_line_skipped", { dir }, { line: r.line, object: label });
  }
  zLines.sort((a, b) => a.z - b.z);
  const stories: Story[] = zLines.map((z, k) => ({ id: `st-${k}`, name: z.label, elevation: z.z, height: k ? round(z.z - zLines[k - 1]!.z) : 0, masterStory: false }));
  if (stories.length) d.add("info", "stories_from_grid", { count: stories.length });
  const storyAt = (z: number) => stories.find((s) => Math.abs(s.elevation - z) < 1e-6)?.id;

  // ------------------------------------------------------------------ vật liệu
  const mech = new Map(T("MATERIAL PROPERTIES 02 - BASIC MECHANICAL PROPERTIES").map((r) => [f(r, "Material") ?? "", r]));
  const steel = new Map(T("MATERIAL PROPERTIES 03A - STEEL DATA").map((r) => [f(r, "Material") ?? "", r]));
  const concrete = new Map(T("MATERIAL PROPERTIES 03B - CONCRETE DATA").map((r) => [f(r, "Material") ?? "", r]));
  const materials: Material[] = [];
  const matByName = new Map<string, Material>();
  const matRecs = T("MATERIAL PROPERTIES 01 - GENERAL");
  for (const r of matRecs) {
    const name = f(r, "Material") ?? "";
    const type = (f(r, "Type") ?? "").toLowerCase();
    const mapped: Material["type"] = type === "steel" ? "steel" : type === "concrete" ? "concrete" : type === "rebar" ? "rebar" : "other";
    if (!["steel", "concrete", "rebar"].includes(type)) d.add("info", "material_type_other", { type: f(r, "Type") ?? "?" }, { line: r.line, object: name });
    const m = mech.get(name);
    const E = m ? n(m, "E1") : Number.NaN;
    if (!(E > 0)) {
      d.add("error", "material_no_e", {}, { line: r.line, object: name });
      continue;
    }
    let nu = m ? n(m, "U12") : Number.NaN;
    if (!(nu >= 0 && nu <= 0.5)) {
      nu = 0.3;
      d.add("info", "material_nu_default", { nu }, { line: r.line, object: name });
    }
    const w = m ? n(m, "UnitWeight") : Number.NaN;
    const strength = mapped === "concrete" ? s2kNumber(concrete.get(name)?.fields.get("Fc")) : s2kNumber(steel.get(name)?.fields.get("Fy"));
    const mat: Material = {
      id: `mat-${materials.length + 1}`,
      name,
      type: mapped,
      E: conv.stress(U, E),
      nu,
      gamma: Number.isFinite(w) && w >= 0 ? conv.unitWeight(U, w) : 0,
      ...(Number.isFinite(strength) && strength > 0 ? { strength: conv.stress(U, strength) } : {}),
    };
    materials.push(mat);
    matByName.set(name, mat);
  }
  count("materials", matRecs.length, materials.length);

  // ------------------------------------------------------------------ tiết diện thanh
  const frameSections: FrameSection[] = [];
  const secByName = new Map<string, FrameSection>();
  const secRecs = T("FRAME SECTION PROPERTIES 01 - GENERAL");
  // Độ lệch đặc trưng NexFEM tự tính so với giá trị SAP2000 ghi trong file, theo tên tiết diện.
  const propDev = new Map<string, { A: number; I: number; J: number }>();
  const inferred = new Map<string, number>();
  for (const r of secRecs) {
    const name = f(r, "SectionName") ?? "";
    const shape = f(r, "Shape") ?? "";
    const at = { line: r.line, object: name };
    const mat = matByName.get(f(r, "Material") ?? "");
    if (!mat) {
      d.add("error", "section_material_missing", { material: f(r, "Material") ?? "?" }, at);
      continue;
    }
    const t3 = n(r, "t3");
    const t2 = n(r, "t2");
    const tf = n(r, "tf");
    const tw = n(r, "tw");
    const ref = { A: n(r, "Area") * U.l ** 2, I33: n(r, "I33") * U.l ** 4, I22: n(r, "I22") * U.l ** 4, J: n(r, "TorsConst") * U.l ** 4 };
    let geometry: FrameShape | null = null;
    if (shape === "I/Wide Flange" && t3 > 0 && t2 > 0 && tf > 0 && tw > 0) {
      const g = { shape: "I" as const, h: L(t3), bf: L(t2), tf: L(tf), tw: L(tw) };
      let rr = L(n(r, "FilletRadius"));
      // Một số tiết diện cán trong file ghi FilletRadius = 0 nhưng A, I, J lại lấy từ bảng thép có góc lượn.
      // Khi đó suy bán kính từ phần diện tích dư: 4 góc lượn thêm (4 − π)·r².
      if (!(rr > 0) && ref.A > 0) {
        const extra = ref.A - sectionProperties(g).A;
        const guess = extra > 0 ? Math.sqrt(extra / (4 - Math.PI)) : 0;
        if (guess > 0 && extra / ref.A > 1e-3 && guess < (g.bf - g.tw) / 2 && guess < g.h / 2 - g.tf) {
          rr = Number(guess.toPrecision(4));
          inferred.set(name, rr);
        }
      }
      geometry = rr > 0 ? { ...g, r: rr } : g;
      const t2b = n(r, "t2b");
      const tfb = n(r, "tfb");
      if ((Number.isFinite(t2b) && Math.abs(t2b - t2) > 1e-9) || (Number.isFinite(tfb) && Math.abs(tfb - tf) > 1e-9)) d.add("warning", "section_unsymmetric_i", {}, at);
    } else if (shape === "Box/Tube" && t3 > 0 && t2 > 0 && tf > 0) {
      geometry = { shape: "box", h: L(t3), b: L(t2), t: L(tf) };
      if (tw > 0 && Math.abs(tw - tf) > 1e-9) d.add("warning", "section_tube_tw", {}, at);
    } else if (shape === "Rectangular" && t3 > 0 && t2 > 0) geometry = { shape: "rect", b: L(t2), h: L(t3) };
    else if (shape === "Circle" && t3 > 0) geometry = { shape: "circle", d: L(t3) };
    else if (shape === "Pipe" && t3 > 0 && tw > 0) geometry = { shape: "pipe", d: L(t3), t: L(tw) };
    if (!geometry) {
      d.add("error", "section_unsupported", { shape: shape || "?" }, at);
      continue;
    }
    // Hệ số sửa đặc trưng của tiết diện (AMod, I3Mod…) chưa hỗ trợ.
    if (["AMod", "A2Mod", "A3Mod", "JMod", "I2Mod", "I3Mod"].some((k) => r.fields.has(k) && n(r, k) !== 1)) d.add("warning", "section_modifiers_ignored", {}, at);
    const p = sectionProperties(geometry);
    if ([ref.A, ref.I33, ref.I22, ref.J].every((v) => v > 0)) {
      const dev = (got: number, want: number) => (got - want) / want;
      const dI = [dev(p.I33, ref.I33), dev(p.I22, ref.I22)].reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
      propDev.set(name, { A: dev(p.A, ref.A), I: dI, J: dev(p.J, ref.J) });
    }
    // SAP2000 tính biến dạng cắt với diện tích chịu cắt AS2, AS3 ghi trong file: giữ nguyên để kết quả khớp.
    const as2 = n(r, "AS2") * U.l ** 2;
    const as3 = n(r, "AS3") * U.l ** 2;
    const shear = as2 > 0 && as3 > 0 && as2 <= p.A && as3 <= p.A ? { shearAreas: { a2: as2, a3: as3 } } : {};
    const sec: FrameSection = { id: `fs-${frameSections.length + 1}`, name, material: mat.id, geometry, ...shear };
    frameSections.push(sec);
    secByName.set(name, sec);
  }
  count("frameSections", secRecs.length, frameSections.length);

  // ------------------------------------------------------------------ tiết diện sàn
  const shellSections: ShellSection[] = [];
  const shellSecByName = new Map<string, ShellSection>();
  const areaSecRecs = T("AREA SECTION PROPERTIES");
  for (const r of areaSecRecs) {
    const name = f(r, "Section") ?? "";
    const at = { line: r.line, object: name };
    const mat = matByName.get(f(r, "Material") ?? "");
    const t = n(r, "Thickness");
    const type = (f(r, "Type") ?? "").toLowerCase();
    const areaType = (f(r, "AreaType") ?? "").toLowerCase();
    if (!mat || !(t > 0) || (areaType && areaType !== "shell")) {
      d.add("warning", "shell_section_unsupported", { type: f(r, "AreaType") ?? f(r, "Type") ?? "?" }, at);
      continue;
    }
    const formulation: ShellSection["formulation"] = type === "shell-thick" ? "shell-thick" : type === "membrane" ? "membrane" : type === "plate-thin" || type === "plate-thick" ? "plate" : "shell-thin";
    const sec: ShellSection = { id: `ss-${shellSections.length + 1}`, name, material: mat.id, kind: "slab", formulation, thickness: L(t) };
    shellSections.push(sec);
    shellSecByName.set(name, sec);
  }

  // ------------------------------------------------------------------ nút
  const joints: Joint[] = [];
  const jointByName = new Map<string, Joint>();
  const jointRecs = T("JOINT COORDINATES");
  for (const r of jointRecs) {
    const name = f(r, "Joint") ?? "";
    const at = { line: r.line, object: name };
    let xyz: V3 | null = null;
    if (r.fields.has("GlobalX") && r.fields.has("GlobalY") && r.fields.has("GlobalZ")) xyz = [n(r, "GlobalX"), n(r, "GlobalY"), n(r, "GlobalZ")];
    else if ((f(r, "CoordSys") ?? "GLOBAL").toUpperCase() === "GLOBAL" && (f(r, "CoordType") ?? "Cartesian").toLowerCase() === "cartesian") xyz = [n(r, "XorR"), n(r, "Y"), n(r, "Z")];
    if (!xyz || xyz.some((v) => !Number.isFinite(v))) {
      d.add("error", xyz ? "point_invalid" : "coord_system_unsupported", { system: f(r, "CoordSys") ?? "?" }, at);
      continue;
    }
    const z = round(L(xyz[2]));
    const story = storyAt(z);
    const j: Joint = { id: `j-${joints.length + 1}`, label: name, x: round(L(xyz[0])), y: round(L(xyz[1])), z, ...(story ? { story } : {}) };
    joints.push(j);
    jointByName.set(name, j);
  }
  count("joints", jointRecs.length, joints.length);

  // Gối, cộng với các bậc tự do không hoạt động (SAP2000 bỏ chúng khỏi toàn mô hình: tương đương giữ ở mọi nút).
  const restrained = new Map<string, boolean[]>();
  for (const r of T("JOINT RESTRAINT ASSIGNMENTS")) {
    const j = jointByName.get(f(r, "Joint") ?? "");
    if (!j) {
      d.add("error", "point_missing", { point: f(r, "Joint") ?? "?" }, { line: r.line });
      continue;
    }
    restrained.set(j.id, ["U1", "U2", "U3", "R1", "R2", "R3"].map((k) => s2kYes(f(r, k))));
  }
  for (const j of joints) {
    const own = restrained.get(j.id) ?? [false, false, false, false, false, false];
    const all = own.map((v, i) => v || inactive[i]!) as [boolean, boolean, boolean, boolean, boolean, boolean];
    if (all.some(Boolean)) j.restraint = all;
  }
  if (!restrained.size) d.add("error", "no_supports_imported");

  // ------------------------------------------------------------------ thanh
  const assign = new Map(T("FRAME SECTION ASSIGNMENTS").map((r) => [f(r, "Frame") ?? "", r]));
  const releases = new Map(T("FRAME RELEASE ASSIGNMENTS 1 - GENERAL").map((r) => [f(r, "Frame") ?? "", r]));
  const fixity = new Map(T("FRAME RELEASE ASSIGNMENTS 2 - PARTIAL FIXITY").map((r) => [f(r, "Frame") ?? "", r]));
  const angles = new Map(T("FRAME LOCAL AXES ASSIGNMENTS 1 - TYPICAL").map((r) => [f(r, "Frame") ?? "", r]));
  const insertion = new Map(T("FRAME INSERTION POINT ASSIGNMENTS").map((r) => [f(r, "Frame") ?? "", r]));
  const offsets = new Map(T("FRAME OFFSET ALONG LENGTH ASSIGNMENTS").map((r) => [f(r, "Frame") ?? "", r]));
  const modifiers = new Map(T("FRAME PROPERTY MODIFIERS").map((r) => [f(r, "Frame") ?? "", r]));
  const frames: Frame[] = [];
  const frameByName = new Map<string, Frame>();
  const frameRecs = T("CONNECTIVITY - FRAME");
  for (const r of frameRecs) {
    const name = f(r, "Frame") ?? "";
    const at = { line: r.line, object: name };
    const a = jointByName.get(f(r, "JointI") ?? "");
    const b = jointByName.get(f(r, "JointJ") ?? "");
    if (!a || !b || a === b) {
      d.add("error", "point_missing", { point: `${f(r, "JointI") ?? "?"}/${f(r, "JointJ") ?? "?"}` }, at);
      continue;
    }
    if (s2kYes(f(r, "IsCurved"))) d.add("warning", "frame_curved_straightened", {}, at);
    const sa = assign.get(name);
    const secName = sa ? f(sa, "AnalSect") : undefined;
    const sec = secName ? secByName.get(secName) : undefined;
    if (!sec) {
      d.add("error", secName ? "frame_section_unavailable" : "frame_no_section", { section: secName ?? "?" }, at);
      continue;
    }
    if (sa && (f(sa, "MatProp") ?? "Default") !== "Default") d.add("warning", "frame_material_override_ignored", { material: f(sa, "MatProp")! }, at);
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const vert = Math.abs(b.z - a.z) / len;
    const kind: Frame["kind"] = vert > 1 - 1e-6 ? "column" : vert < 1e-3 ? "beam" : "brace";
    const frame: Frame = {
      id: `f-${frames.length + 1}`,
      label: name,
      kind,
      i: a.id,
      j: b.id,
      section: sec.id,
      ...(b.story ?? a.story ? { story: (b.story ?? a.story)! } : {}),
    };
    // Nhả liên kết; liên kết nửa cứng: rất cứng so với 4EI/L thì coi như không nhả, rất mềm thì coi như khớp.
    const rel = releases.get(name);
    if (rel) {
      const keys = ["P", "V2", "V3", "T", "M2", "M3"];
      const i = keys.map((k) => s2kYes(f(rel, `${k}I`)));
      const j = keys.map((k) => s2kYes(f(rel, `${k}J`)));
      const fx = fixity.get(name);
      if (fx) {
        const mat = materials.find((m) => m.id === sec.material)!;
        const props = sectionProperties(sec.geometry);
        for (const [end, arr] of [["I", i], ["J", j]] as const) {
          for (const [idx, key] of [[4, "M2"], [5, "M3"]] as const) {
            const k = s2kNumber(fx.fields.get(`${key}${end}`));
            if (!(k > 0) || !arr[idx]) continue;
            const kRef = (4 * mat.E * (key === "M3" ? props.I33 : props.I22)) / len; // kN·m/rad
            const ratio = (k * U.f * U.l) / kRef;
            const where = { line: fx.line, object: `${name} (${key}${end})` };
            if (ratio >= 1000) {
              arr[idx] = false;
              d.add("warning", "partial_fixity_as_fixed", {}, where);
            } else if (ratio <= 0.001) d.add("warning", "partial_fixity_as_pinned", {}, where);
            else d.add("error", "partial_fixity_unsupported", {}, { line: fx.line, object: `${name} (${key}${end}: ${Number(ratio.toPrecision(3))} × 4EI/L)` });
          }
          for (const key of ["P", "V2", "V3", "T"]) if (s2kNumber(fx.fields.get(`${key}${end}`)) > 0) d.add("error", "partial_fixity_unsupported", {}, { line: fx.line, object: `${name} (${key}${end})` });
        }
      }
      if (i.some(Boolean) || j.some(Boolean)) frame.releases = { i, j };
    }
    // Góc xoay trục địa phương: cùng quy ước CSI với NexFEM (schema Frame.angle, fem-solver local_axes).
    const ang = angles.get(name);
    if (ang) {
      const a = n(ang, "Angle");
      if (s2kYes(f(ang, "AdvanceAxes"))) d.add("warning", "frame_axes_advanced_ignored", {}, at);
      if (Number.isFinite(a) && a !== 0) {
        frame.angle = a;
        d.add("info", "frame_angle_imported", {}, at);
      }
    }
    const ins = insertion.get(name);
    if (ins && !/^10\b/.test(f(ins, "CardinalPt") ?? "10")) d.add("warning", "frame_cardinal_ignored", { point: (f(ins, "CardinalPt") ?? "").replace(/\s*\(.*\)/, "") }, at);
    const off = offsets.get(name);
    if (off && n(off, "RigidFactor") > 0 && ((f(off, "Type") ?? "") === "Automatic" || n(off, "LengthI") > 0 || n(off, "LengthJ") > 0)) d.add("warning", "frame_length_offset_ignored", {}, at);
    const mod = modifiers.get(name);
    if (mod && ["AMod", "AS2Mod", "AS3Mod", "JMod", "I22Mod", "I33Mod"].some((k) => mod.fields.has(k) && n(mod, k) !== 1)) d.add("warning", "frame_modifiers_ignored", {}, at);
    frames.push(frame);
    frameByName.set(name, frame);
  }
  count("frames", frameRecs.length, frames.length);

  // Đặc trưng tiết diện: so với giá trị trong file. Chỉ cảnh báo tiết diện có thanh dùng (ảnh hưởng kết quả);
  // các tiết diện chỉ nằm trong thư viện của file được tóm tắt ở thông báo chung.
  const used = new Set(frames.map((x) => x.section));
  const maxAbs = (k: "A" | "I" | "J") => Math.max(0, ...[...propDev.values()].map((v) => Math.abs(v[k])));
  if (propDev.size) d.add("info", "section_props_checked", { count: propDev.size, a: pct(maxAbs("A")), i: pct(maxAbs("I")), j: pct(maxAbs("J")) });
  for (const sec of frameSections) {
    const v = propDev.get(sec.name);
    if (!used.has(sec.id) || !v || (Math.abs(v.A) <= PROP_TOL.A && Math.abs(v.I) <= PROP_TOL.I && Math.abs(v.J) <= PROP_TOL.J)) continue;
    d.add("warning", "section_props_differ", {}, { object: `${sec.name} (A ${pct(v.A, true)}, I ${pct(v.I, true)}, J ${pct(v.J, true)})` });
  }
  let inferredUnused = 0;
  for (const sec of frameSections) {
    const rr = inferred.get(sec.name);
    if (rr === undefined) continue;
    if (used.has(sec.id)) d.add("warning", "section_fillet_inferred", {}, { object: `${sec.name} (r ≈ ${(rr * 1000).toFixed(1)} mm)` });
    else inferredUnused++;
  }
  if (inferredUnused) d.add("info", "section_fillet_inferred_unused", { count: inferredUnused });
  const sheared = frameSections.filter((x) => x.shearAreas && used.has(x.id)).length;
  if (sheared) d.add("info", "section_shear_areas", { count: sheared });

  // ------------------------------------------------------------------ sàn / vách
  const areaAssign = new Map(T("AREA SECTION ASSIGNMENTS").map((r) => [f(r, "Area") ?? "", r]));
  const shells: Shell[] = [];
  const shellByName = new Map<string, Shell>();
  let noneSection: ShellSection | null = null;
  const areaRecs = T("CONNECTIVITY - AREA");
  for (const r of areaRecs) {
    const name = f(r, "Area") ?? "";
    const at = { line: r.line, object: name };
    const pts: Joint[] = [];
    for (let k = 1; r.fields.has(`Joint${k}`); k++) {
      const j = jointByName.get(f(r, `Joint${k}`)!);
      if (!j) {
        d.add("error", "point_missing", { point: f(r, `Joint${k}`)! }, at);
        pts.length = 0;
        break;
      }
      pts.push(j);
    }
    if (pts.length < 3) {
      d.add("error", "area_invalid", {}, at);
      continue;
    }
    const sa = areaAssign.get(name);
    const secName = sa ? f(sa, "Section") : undefined;
    let sec = secName ? shellSecByName.get(secName) : undefined;
    if (secName === "None") {
      // Mặt "None" của SAP2000 chỉ truyền tải, không có độ cứng và trọng lượng: dùng tiết diện không trọng lượng.
      if (!noneSection) {
        const mat: Material = { id: `mat-${materials.length + 1}`, name: "None (không trọng lượng)", type: "other", E: 1, nu: 0, gamma: 0 };
        materials.push(mat);
        noneSection = { id: `ss-${shellSections.length + 1}`, name: "None", material: mat.id, kind: "slab", formulation: "membrane", thickness: 1e-3 };
        shellSections.push(noneSection);
      }
      sec = noneSection;
      d.add("info", "area_section_none", {}, at);
    }
    if (!sec) {
      d.add("error", "area_section_unavailable", { section: secName ?? "?", story: "" }, at);
      continue;
    }
    // Pháp tuyến (Newell): mặt gần thẳng đứng là vách.
    const nrm: V3 = [0, 0, 0];
    pts.forEach((p, k) => {
      const q = pts[(k + 1) % pts.length]!;
      nrm[0] += (p.y - q.y) * (p.z + q.z);
      nrm[1] += (p.z - q.z) * (p.x + q.x);
      nrm[2] += (p.x - q.x) * (p.y + q.y);
    });
    const nz = Math.abs(nrm[2]) / (Math.hypot(...nrm) || 1);
    const story = pts.every((p) => p.story && p.story === pts[0]!.story) ? pts[0]!.story : undefined;
    const shell: Shell = { id: `s-${shells.length + 1}`, label: name, kind: nz < 0.1 ? "wall" : "slab", joints: pts.map((p) => p.id), section: sec.id, ...(story ? { story } : {}) };
    shells.push(shell);
    shellByName.set(name, shell);
  }
  count("shells", areaRecs.length, shells.length);
  count("shellSections", areaSecRecs.length, shellSections.length);

  // ------------------------------------------------------------------ mẫu tải, trường hợp, tổ hợp
  const patterns: LoadPattern[] = [];
  const patByName = new Map<string, string>();
  const patRecs = T("LOAD PATTERN DEFINITIONS");
  for (const r of patRecs) {
    const name = f(r, "LoadPat") ?? "";
    const t = (f(r, "DesignType") ?? "").toLowerCase();
    const type: LoadPattern["type"] = t === "dead" ? "dead" : t === "super dead" ? "superDead" : t === "live" || t === "roof live" || t === "reducible live" ? "live" : t === "wind" ? "wind" : t === "quake" || t === "seismic" ? "seismic" : "other";
    if (!["dead", "super dead", "live", "wind", "quake"].includes(t)) d.add("info", "pattern_type_mapped", { from: f(r, "DesignType") ?? "?", to: type }, { line: r.line, object: name });
    const sw = n(r, "SelfWtMult");
    const id = `lp-${patterns.length + 1}`;
    patterns.push({ id, name, type, selfWeight: Number.isFinite(sw) && sw >= 0 ? sw : 0 });
    patByName.set(name, id);
  }
  count("loadPatterns", patRecs.length, patterns.length);

  const caseItems = new Map<string, S2kRecord[]>();
  for (const r of T("CASE - STATIC 1 - LOAD ASSIGNMENTS")) caseItems.set(f(r, "Case") ?? "", [...(caseItems.get(f(r, "Case") ?? "") ?? []), r]);
  const loadCases: LoadCase[] = [];
  const caseByName = new Map<string, string>();
  const caseRecs = T("LOAD CASE DEFINITIONS");
  for (const r of caseRecs) {
    const name = f(r, "Case") ?? "";
    const type = (f(r, "Type") ?? "").toLowerCase();
    const at = { line: r.line, object: name };
    const kind: LoadCase["type"] | null = type === "linstatic" ? "linearStatic" : type === "linmodal" || type === "linmodalritz" ? "modal" : null;
    if (!kind) {
      d.add("error", "case_unsupported", { type: f(r, "Type") ?? "?" }, at);
      continue;
    }
    const ic = (f(r, "InitialCond") ?? "Zero").toLowerCase();
    if (ic !== "zero") d.add("warning", "case_initcond_ignored", { value: f(r, "InitialCond")! }, at);
    const loads: LoadCase["loads"] = [];
    for (const it of caseItems.get(name) ?? []) {
      const pat = patByName.get(f(it, "LoadName") ?? "");
      const sf = n(it, "LoadSF");
      if ((f(it, "LoadType") ?? "").toLowerCase() !== "load pattern") d.add("error", "case_item_unsupported", { type: f(it, "LoadType") ?? "?" }, { line: it.line, object: name });
      else if (pat && Number.isFinite(sf)) loads.push({ pattern: pat, factor: sf });
      else d.add("warning", "case_item_missing", { pattern: f(it, "LoadName") ?? "?" }, { line: it.line, object: name });
    }
    const id = `lc-${loadCases.length + 1}`;
    loadCases.push({ id, name, type: kind, loads });
    caseByName.set(name, id);
  }
  count("loadCases", caseRecs.length, loadCases.length);

  // Tổ hợp: dòng đầu có ComboType, các dòng sau cùng ComboName là thành phần.
  const comboRows = new Map<string, S2kRecord[]>();
  for (const r of T("COMBINATION DEFINITIONS")) comboRows.set(f(r, "ComboName") ?? "", [...(comboRows.get(f(r, "ComboName") ?? "") ?? []), r]);
  const COMBO_TYPES: Record<string, LoadCombo["type"]> = { "linear add": "linearAdd", envelope: "envelope", srss: "srss", "absolute add": "absAdd" };
  const comboId = new Map<string, string>();
  [...comboRows].filter(([, rows]) => COMBO_TYPES[(rows.find((x) => x.fields.has("ComboType"))?.fields.get("ComboType") ?? "").toLowerCase()]).forEach(([name], k) => comboId.set(name, `co-${k + 1}`));
  const combos: LoadCombo[] = [];
  for (const [name, rows] of comboRows) {
    const head = rows.find((x) => x.fields.has("ComboType"));
    const at = { line: rows[0]!.line, object: name };
    const type = COMBO_TYPES[(head?.fields.get("ComboType") ?? "").toLowerCase()];
    if (!type) {
      d.add("error", "combo_type_unsupported", { type: head?.fields.get("ComboType") ?? "?" }, at);
      continue;
    }
    const items: LoadCombo["items"] = [];
    for (const row of rows) {
      const cn = f(row, "CaseName");
      const sf = n(row, "ScaleFactor");
      if (cn === undefined) continue;
      const target = caseByName.get(cn) ?? comboId.get(cn);
      if (target && Number.isFinite(sf)) items.push({ case: target, factor: sf });
      else d.add("warning", "combo_item_missing", { item: cn }, at);
    }
    if (head && ["SteelDesign", "ConcDesign", "AlumDesign", "ColdDesign"].some((k) => head.fields.has(k))) d.add("info", "combo_design_ignored", {}, at);
    combos.push({ id: comboId.get(name)!, name, type, items });
  }
  count("combos", comboRows.size, combos.length);

  // ------------------------------------------------------------------ tải
  const DIRS: Record<string, FrameLoad["direction"]> = { GRAVITY: "gravity", X: "globalX", Y: "globalY", Z: "globalZ" };
  // Trục địa phương 1, 2, 3 của NexFEM theo quy ước CSI (mặc định và góc xoay), nên tải theo trục địa phương nhập thẳng.
  const LOCAL: Record<string, FrameLoad["direction"]> = { "1": "localX", "2": "local2", "3": "local3" };
  const loadDir = (r: S2kRecord): FrameLoad["direction"] | null => {
    const sys = (f(r, "CoordSys") ?? "GLOBAL").toUpperCase();
    const dir = (f(r, "Dir") ?? "").toUpperCase();
    if (sys === "LOCAL") return LOCAL[dir] ?? null;
    if (sys !== "GLOBAL") return null;
    return DIRS[dir] ?? null;
  };
  const frameLoads: FrameLoad[] = [];
  const distRecs = T("FRAME LOADS - DISTRIBUTED");
  for (const r of distRecs) {
    const frame = frameByName.get(f(r, "Frame") ?? "");
    const pat = patByName.get(f(r, "LoadPat") ?? "");
    const at = { line: r.line, object: f(r, "Frame") ?? "?" };
    const dir = loadDir(r);
    if (!frame || !pat) {
      d.add("error", "load_target_missing", { kind: "frame" }, at);
      continue;
    }
    if ((f(r, "Type") ?? "Force").toLowerCase() !== "force" || !dir) {
      d.add("error", "line_load_unsupported", { type: f(r, "Type") ?? "?", dir: f(r, "Dir") ?? "?" }, at);
      continue;
    }
    if (dir === "local2" || dir === "local3") d.add("info", "line_load_local_axis_note", {}, at);
    const a = n(r, "RelDistA");
    const b = n(r, "RelDistB");
    const wa = n(r, "FOverLA");
    const wb = n(r, "FOverLB");
    if (![a, b, wa, wb].every(Number.isFinite) || b < a) {
      d.add("error", "line_load_unsupported", { type: f(r, "DistType") ?? "?", dir: f(r, "Dir") ?? "?" }, at);
      continue;
    }
    const w = ((wa + wb) / 2) * (b - a);
    if (wa !== wb || a > 1e-9 || b < 1 - 1e-9) d.add("warning", "line_load_approximated", {}, at);
    frameLoads.push({ id: `fl-${frameLoads.length + 1}`, frame: frame.id, pattern: pat, kind: "distributed", direction: dir, value: conv.forcePerLength(U, w) });
  }
  const pointRecs = T("FRAME LOADS - POINT");
  for (const r of pointRecs) {
    const frame = frameByName.get(f(r, "Frame") ?? "");
    const pat = patByName.get(f(r, "LoadPat") ?? "");
    const at = { line: r.line, object: f(r, "Frame") ?? "?" };
    const dir = loadDir(r);
    const rel = n(r, "RelDist");
    const force = n(r, "Force");
    if (!frame || !pat) {
      d.add("error", "load_target_missing", { kind: "frame" }, at);
      continue;
    }
    if ((f(r, "Type") ?? "Force").toLowerCase() !== "force" || !dir || !(rel >= 0 && rel <= 1) || !Number.isFinite(force)) {
      d.add("error", "line_load_unsupported", { type: f(r, "Type") ?? "?", dir: f(r, "Dir") ?? "?" }, at);
      continue;
    }
    if (dir === "local2" || dir === "local3") d.add("info", "line_load_local_axis_note", {}, at);
    frameLoads.push({ id: `fl-${frameLoads.length + 1}`, frame: frame.id, pattern: pat, kind: "point", direction: dir, value: conv.force(U, force), at: rel });
  }
  count("frameLoads", distRecs.length + pointRecs.length, frameLoads.length);

  const shellLoads: ShellLoad[] = [];
  const areaLoadRecs = T("AREA LOADS - UNIFORM");
  for (const r of areaLoadRecs) {
    const shell = shellByName.get(f(r, "Area") ?? "");
    const pat = patByName.get(f(r, "LoadPat") ?? "");
    const at = { line: r.line, object: f(r, "Area") ?? "?" };
    const sys = (f(r, "CoordSys") ?? "GLOBAL").toUpperCase();
    const dir = (f(r, "Dir") ?? "").toUpperCase();
    const v = n(r, "UnifLoad");
    if (!shell || !pat) {
      d.add("error", "load_target_missing", { kind: "area" }, at);
      continue;
    }
    const direction: ShellLoad["direction"] | null = sys === "GLOBAL" && dir === "GRAVITY" ? "gravity" : sys === "GLOBAL" && dir === "Z" ? "globalZ" : sys === "LOCAL" && dir === "3" ? "local3" : null;
    if (!direction || !Number.isFinite(v)) {
      d.add("error", "area_load_unsupported", { type: sys, dir }, at);
      continue;
    }
    shellLoads.push({ id: `sl-${shellLoads.length + 1}`, shell: shell.id, pattern: pat, direction, value: conv.stress(U, v) });
  }
  count("shellLoads", areaLoadRecs.length, shellLoads.length);

  const jointLoadRecs = T("JOINT LOADS - FORCE");
  for (const r of jointLoadRecs) d.add("error", "point_loads_unsupported", { pattern: f(r, "LoadPat") ?? "?" }, { line: r.line, object: f(r, "Joint") ?? "?" });
  count("pointLoads", jointLoadRecs.length, 0);

  // ------------------------------------------------------------------ bảng bỏ qua
  for (const [name, recs] of file.tables) {
    if (TABLES_USED.has(name) || !recs.length) continue;
    d.add("info", "section_ignored", { section: name, records: recs.length }, { line: file.tableLines.get(name) });
  }

  const model = parseModel({
    schemaVersion: MODEL_SCHEMA_VERSION,
    name: opts.name ?? modelName,
    units: { force: "kN", length: "m", temperature: U.temperature === "F" ? "F" : "C" },
    designCodes: {},
    grids: grid.x.length || grid.y.length ? [grid] : [],
    stories,
    materials,
    frameSections,
    shellSections,
    joints,
    frames,
    shells,
    loadPatterns: patterns,
    loadCases,
    combos,
    frameLoads,
    shellLoads,
  } satisfies Model);
  return {
    model,
    report: {
      program,
      version,
      units: { force: U.force, length: U.length, temperature: U.temperature },
      counts,
      diagnostics: d.list(),
      mapping: {
        joints: Object.fromEntries([...jointByName].map(([k, v]) => [k, v.id])),
        frames: Object.fromEntries([...frameByName].map(([k, v]) => [k, v.id])),
        shells: Object.fromEntries([...shellByName].map(([k, v]) => [k, v.id])),
      },
    },
  };
}

function round(v: number): number {
  return v === 0 ? 0 : Number(v.toPrecision(12));
}

function pct(v: number, signed = false): string {
  return `${signed && v > 0 ? "+" : ""}${(v * 100).toFixed(2)} %`;
}

function emptyModel(name: string): Model {
  return parseModel({
    schemaVersion: MODEL_SCHEMA_VERSION,
    name,
    units: { force: "kN", length: "m", temperature: "C" },
    designCodes: {},
    grids: [],
    stories: [],
    materials: [],
    frameSections: [],
    shellSections: [],
    joints: [],
    frames: [],
    shells: [],
    loadPatterns: [],
    loadCases: [],
    combos: [],
    frameLoads: [],
    shellLoads: [],
  } satisfies Model);
}
