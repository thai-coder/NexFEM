import {
  MODEL_SCHEMA_VERSION,
  parseModel,
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
  type JointLoad,
  type ShellSection,
  type Story,
} from "@nexfem/model-core";
import { e2kNumber, e2kPairs, e2kSection, parseE2k, type E2kFile, type E2kRecord, type E2kToken } from "./e2k-parse.ts";
import { Diagnostics, type ImportDiagnostic } from "./diagnostics.ts";
import { cornerAreas, frameAxes, globalAxisOf, locatePoint, meshedNodeAreas, remapFrameLoads, splitFramesAtJoints } from "./locate.ts";
import { conv, unitFactors, type UnitFactors } from "./units.ts";

export type { ImportDiagnostic, ImportLevel } from "./diagnostics.ts";

/**
 * Nhập file ETABS `.e2k` vào mô hình NexFEM.
 *
 * Phạm vi (xem docs/csi-import.md): lưới, tầng, vật liệu, tiết diện thép chữ I / ống hộp / bê tông chữ nhật,
 * nút, thanh (nhả liên kết), sàn, mẫu tải, trường hợp tải tĩnh tuyến tính và modal, tổ hợp, tải phân bố trên thanh,
 * tải phân bố đều trên sàn. Mọi thứ khác được ghi vào báo cáo với mức:
 * - `error`: dữ liệu ảnh hưởng tới phân tích nhưng không nhập được (tải, thanh, gối bị bỏ);
 * - `warning`: nhập gần đúng hoặc bỏ một thuộc tính có ảnh hưởng (góc xoay trục, điểm chèn, lò xo…);
 * - `info`: dữ liệu không ảnh hưởng mô hình phân tích tuyến tính (lưới chia, thiết kế, nhóm…).
 */

export interface E2kImportReport {
  program: string;
  version: string;
  units: { force: string; length: string; temperature: string } | null;
  /** Số bản ghi trong file và số đối tượng NexFEM tạo ra, theo loại. */
  counts: Record<string, { source: number; imported: number }>;
  diagnostics: ImportDiagnostic[];
  /** Tên ETABS → id NexFEM. Khoá nút/thanh/sàn có dạng `tên|tầng`. */
  mapping: { joints: Record<string, string>; frames: Record<string, string>; shells: Record<string, string> };
}

export interface E2kImportResult {
  model: Model;
  report: E2kImportReport;
}

/** Gộp các dòng cùng một đối tượng (cùng tên, hoặc cùng tên + tầng) thành một bộ cặp từ khoá. */
interface Merged {
  pairs: Map<string, E2kToken>;
  lines: number[];
  /** Mọi cặp theo thứ tự, giữ cặp lặp lại. */
  all: [string, E2kToken][];
}

function mergeBy(records: E2kRecord[], keyCount: 1 | 2, start: number): Map<string, Merged> {
  const out = new Map<string, Merged>();
  for (const r of records) {
    const keyTokens = r.tokens.slice(1, 1 + keyCount);
    if (keyTokens.length < keyCount) continue;
    const key = keyTokens.map((t) => t.text).join("|");
    let m = out.get(key);
    if (!m) {
      m = { pairs: new Map(), lines: [], all: [] };
      out.set(key, m);
    }
    m.lines.push(r.line);
    for (const [k, v] of e2kPairs(r, start)) {
      m.all.push([k, v]);
      if (!m.pairs.has(k)) m.pairs.set(k, v);
    }
  }
  return out;
}

const num = (m: Merged, k: string) => e2kNumber(m.pairs.get(k)?.text);
const str = (m: Merged, k: string) => m.pairs.get(k)?.text;

/** Thứ tự nhả liên kết của NexFEM: [P, V2, V3, T, M2, M3]. */
const RELEASE_DOF = ["P", "V2", "V3", "T", "M2", "M3"] as const;

/** Từ khoá gán thanh chỉ phục vụ chia lưới, xuất kết quả hoặc hiển thị: không ảnh hưởng mô hình phân tích tuyến tính. */
const LINE_KEYS_IGNORED = new Set(["TRANSFORMSTIFF", "MAXSTASPC", "MINNUMSTA", "AUTOMESH", "MESHATINTERSECTIONS", "OFFSETSYS"]);
const AREA_KEYS_IGNORED = new Set(["CARDINALPOINT", "TRANSFORMSTIFFNESSFOROFFSETS", "MASS"]);

/** Phần không dùng cho mô hình phân tích (chỉ báo `info`). */
const SECTIONS_USED = new Set([
  "PROGRAM INFORMATION",
  "CONTROLS",
  "STORIES - IN SEQUENCE FROM TOP",
  "GRIDS",
  "MATERIAL PROPERTIES",
  "FRAME SECTIONS",
  "SLAB PROPERTIES",
  "DECK PROPERTIES",
  "WALL PROPERTIES",
  "POINT COORDINATES",
  "LINE CONNECTIVITIES",
  "AREA CONNECTIVITIES",
  "POINT ASSIGNS",
  "LINE ASSIGNS",
  "AREA ASSIGNS",
  "LOAD PATTERNS",
  "POINT OBJECT LOADS",
  "FRAME OBJECT LOADS",
  "SHELL OBJECT LOADS",
  "LOAD CASES",
  "LOAD COMBINATIONS",
  "ANALYSIS OPTIONS",
  "DIAPHRAGM NAMES",
  "LINE SPRING PROPERTIES",
  "AREA SPRING PROPERTIES",
]);

export function importE2k(input: string | E2kFile, opts: { name?: string } = {}): E2kImportResult {
  const file = typeof input === "string" ? parseE2k(input) : input;
  const d = new Diagnostics();
  const counts: E2kImportReport["counts"] = {};
  const count = (k: string, source: number, imported: number) => (counts[k] = { source, imported });

  // ------------------------------------------------------------------ chương trình, đơn vị
  let program = "";
  let version = "";
  for (const r of e2kSection(file, "PROGRAM INFORMATION")) {
    const p = e2kPairs(r, 0);
    program = p.find(([k]) => k === "PROGRAM")?.[1].text ?? program;
    version = p.find(([k]) => k === "VERSION")?.[1].text ?? version;
  }
  if (program && program.toUpperCase() !== "ETABS") d.add("warning", "not_etabs", { program });
  d.add("info", "program", { program: program || "?", version: version || "?" });

  let u: UnitFactors | null = null;
  let title = "";
  let mergeTol = 0;
  for (const r of e2kSection(file, "CONTROLS")) {
    const head = r.tokens[0]?.text;
    if (head === "UNITS") {
      const [f, l, t] = r.tokens.slice(1, 4).map((x) => x.text);
      const nu = unitFactors(f ?? "", l ?? "", t ?? "C");
      if (!nu) d.add("error", "unknown_units", { force: f ?? "?", length: l ?? "?" }, { line: r.line });
      else if (u && (u.force !== nu.force || u.length !== nu.length)) d.add("error", "units_changed", { force: nu.force, length: nu.length }, { line: r.line });
      else u = nu;
    } else if (head === "TITLE2") title = r.tokens[1]?.text ?? "";
    else if (head === "PREFERENCE") {
      const tol = e2kNumber(e2kPairs(r, 1).find(([k]) => k === "MERGETOL")?.[1].text);
      if (Number.isFinite(tol) && tol > 0) mergeTol = tol;
    }
  }
  if (!u) {
    d.add("error", "missing_units");
    // Không biết đơn vị thì không đổi được số: trả về mô hình trống kèm báo cáo.
    return { model: emptyImported(opts.name ?? (title || "ETABS")), report: { program, version, units: null, counts, diagnostics: d.list(), mapping: { joints: {}, frames: {}, shells: {} } } };
  }
  const U = u;
  d.add("info", "unit_conversion", { force: U.force, length: U.length });
  const L = (v: number) => conv.length(U, v);

  // ------------------------------------------------------------------ tầng (ETABS ghi từ trên xuống)
  const storyRecs = e2kSection(file, "STORIES");
  const raw = storyRecs.map((r) => ({ r, name: r.tokens[1]?.text ?? "", p: new Map(e2kPairs(r, 2)) }));
  const bottomUp = [...raw].reverse();
  const stories: Story[] = [];
  let elevFile = 0;
  bottomUp.forEach((s, k) => {
    const elev = e2kNumber(s.p.get("ELEV")?.text);
    const height = e2kNumber(s.p.get("HEIGHT")?.text);
    if (k === 0) elevFile = Number.isFinite(elev) ? elev : 0;
    else if (Number.isFinite(elev)) elevFile = elev;
    else if (Number.isFinite(height)) elevFile += height;
    else d.add("error", "story_no_height", {}, { line: s.r.line, object: s.name });
    const below = stories[k - 1];
    const story: Story = {
      id: `st-${k}`,
      name: s.name,
      elevation: round(L(elevFile)),
      height: below ? round(Math.max(0, L(elevFile) - below.elevation)) : 0,
      masterStory: s.p.get("MASTERSTORY")?.text.toLowerCase() === "yes",
    };
    const similar = s.p.get("SIMILARTO")?.text;
    if (similar) {
      const target = raw.find((x) => x.name === similar);
      if (target) story.similarTo = `st-${bottomUp.indexOf(target)}`;
    }
    stories.push(story);
  });
  const storyIndex = new Map(stories.map((s, i) => [s.name, i]));
  count("stories", storyRecs.length, stories.length);
  if (!stories.length) d.add("error", "no_stories");

  // ------------------------------------------------------------------ lưới trục
  const grids: GridSystem[] = [];
  const gridById = new Map<string, GridSystem>();
  for (const r of e2kSection(file, "GRIDS")) {
    const head = r.tokens[0]?.text;
    const sys = r.tokens[1]?.text ?? "";
    const p = e2kPairs(r, 2);
    if (head === "GRIDSYSTEM") {
      const g: GridSystem = { id: `g-${grids.length + 1}`, name: sys, x: [], y: [] };
      grids.push(g);
      gridById.set(sys, g);
      for (const [k, v] of p) {
        if (k === "TYPE" && v.text.toUpperCase() !== "CARTESIAN") d.add("warning", "grid_type_unsupported", { type: v.text }, { line: r.line, object: sys });
        else if (k !== "TYPE" && k !== "BUBBLESIZE") d.add("warning", "grid_key_unsupported", { key: k }, { line: r.line, object: sys });
      }
    } else if (head === "GRID") {
      const g = gridById.get(sys);
      const m = new Map(p);
      const dir = m.get("DIR")?.text.toUpperCase();
      const coord = e2kNumber(m.get("COORD")?.text);
      const label = m.get("LABEL")?.text ?? "";
      if (!g || !Number.isFinite(coord) || (dir !== "X" && dir !== "Y")) {
        d.add("warning", "grid_line_skipped", { dir: dir ?? "?" }, { line: r.line, object: label });
        continue;
      }
      const list = dir === "X" ? g.x : g.y;
      list.push({ id: `${g.id}-${dir.toLowerCase()}${list.length + 1}`, label, coord: round(L(coord)) });
    }
  }

  // ------------------------------------------------------------------ vật liệu
  const matRecs = mergeBy(e2kSection(file, "MATERIAL PROPERTIES"), 1, 2);
  const materials: Material[] = [];
  const matByName = new Map<string, string>();
  for (const [name, m] of matRecs) {
    const type = (str(m, "TYPE") ?? "").toLowerCase();
    const mapped: Material["type"] = type === "steel" ? "steel" : type === "concrete" ? "concrete" : type === "rebar" ? "rebar" : "other";
    if (!["steel", "concrete", "rebar"].includes(type)) d.add("info", "material_type_other", { type: str(m, "TYPE") ?? "?" }, { line: m.lines[0], object: name });
    const E = num(m, "E");
    if (!(E > 0)) {
      d.add("error", "material_no_e", {}, { line: m.lines[0], object: name });
      continue;
    }
    let nu = num(m, "U");
    if (!(nu >= 0 && nu <= 0.5)) {
      nu = 0.3;
      d.add("info", "material_nu_default", { nu }, { line: m.lines[0], object: name });
    }
    const w = num(m, "WEIGHTPERVOLUME");
    const strength = mapped === "concrete" ? num(m, "FC") : num(m, "FY");
    const id = `mat-${materials.length + 1}`;
    materials.push({
      id,
      name,
      type: mapped,
      E: conv.stress(U, E),
      nu,
      gamma: Number.isFinite(w) && w >= 0 ? conv.unitWeight(U, w) : 0,
      ...(Number.isFinite(strength) && strength > 0 ? { strength: conv.stress(U, strength) } : {}),
    });
    matByName.set(name, id);
  }
  count("materials", matRecs.size, materials.length);

  // ------------------------------------------------------------------ tiết diện thanh
  const secRecs = mergeBy(e2kSection(file, "FRAME SECTIONS"), 1, 2);
  const frameSections: FrameSection[] = [];
  const secByName = new Map<string, string>();
  for (const [name, m] of secRecs) {
    const shape = str(m, "SHAPE") ?? "";
    const mat = matByName.get(str(m, "MATERIAL") ?? "");
    const at = { line: m.lines[0]!, object: name };
    if (!mat) {
      d.add("error", "section_material_missing", { material: str(m, "MATERIAL") ?? "?" }, at);
      continue;
    }
    const D = num(m, "D");
    const B = num(m, "B");
    const TF = num(m, "TF");
    const TW = num(m, "TW");
    let geometry: FrameShape | null = null;
    if (shape === "Steel I/Wide Flange" && D > 0 && B > 0 && TF > 0 && TW > 0) {
      geometry = { shape: "I", h: L(D), bf: L(B), tf: L(TF), tw: L(TW) };
      if (m.pairs.has("BB") || m.pairs.has("TFB")) d.add("warning", "section_unsymmetric_i", {}, at);
      d.add("info", "section_no_root_radius", {}, at);
    } else if ((shape === "Steel Tube" || shape === "Filled Steel Tube") && D > 0 && B > 0 && TF > 0) {
      geometry = { shape: "box", h: L(D), b: L(B), t: L(TF) };
      if (TW > 0 && Math.abs(TW - TF) > 1e-9) d.add("warning", "section_tube_tw", {}, at);
      if (shape === "Filled Steel Tube") d.add("warning", "section_filled_tube", { fill: str(m, "FILLMATERIAL") ?? "?" }, at);
      else d.add("info", "section_no_corner_radius", {}, at);
    } else if (shape === "Concrete Rectangular" && D > 0 && B > 0) {
      geometry = { shape: "rect", b: L(B), h: L(D) };
    } else if (shape === "Steel Angle" && D > 0 && B > 0 && TF > 0 && TW > 0 && TW < B && TF < D) {
      // D: cánh dọc trục 2 (dày TW), B: cánh dọc trục 3 (dày TF).
      geometry = { shape: "L", h: L(D), b: L(B), tw: L(TW), tf: L(TF) };
      d.add("warning", "section_angle_geometric_axes", {}, at);
    }
    let shear: Pick<FrameSection, "shearAreas"> = {};
    if (shape === "General") {
      const [A, I33, I22, J] = ["AREA", "I33", "I22", "TORSION"].map((k) => num(m, k));
      if ([A, I33, I22, J].every((v) => v! > 0)) {
        geometry = { shape: "general", A: A! * U.l ** 2, I33: I33! * U.l ** 4, I22: I22! * U.l ** 4, J: J! * U.l ** 4, ...(D > 0 ? { h: L(D) } : {}), ...(B > 0 ? { b: L(B) } : {}) };
        const [as2, as3] = ["AS2", "AS3"].map((k) => num(m, k)! * U.l ** 2);
        if (as2! > 0 && as3! > 0 && as2! <= geometry.A && as3! <= geometry.A) shear = { shearAreas: { a2: as2!, a3: as3! } };
        d.add("info", "section_general_imported", {}, at);
      }
    }
    if (!geometry) {
      d.add("error", "section_unsupported", { shape: shape || "?" }, at);
      continue;
    }
    const id = `fs-${frameSections.length + 1}`;
    frameSections.push({ id, name, material: mat, geometry, ...shear });
    secByName.set(name, id);
  }
  count("frameSections", secRecs.size, frameSections.length);

  // ------------------------------------------------------------------ tiết diện sàn / vách
  const shellRecs = mergeBy([...e2kSection(file, "SLAB PROPERTIES"), ...e2kSection(file, "DECK PROPERTIES"), ...e2kSection(file, "WALL PROPERTIES")], 1, 2);
  const shellSections: ShellSection[] = [];
  const shellSecByName = new Map<string, string>();
  for (const [name, m] of shellRecs) {
    const type = (str(m, "PROPTYPE") ?? "").toLowerCase();
    const at = { line: m.lines[0]!, object: name };
    const mat = matByName.get(str(m, "MATERIAL") ?? "");
    const t = type === "wall" ? num(m, "WALLTHICKNESS") : num(m, "SLABTHICKNESS");
    if ((type !== "slab" && type !== "wall") || !mat || !(t > 0)) {
      d.add("warning", "shell_section_unsupported", { type: str(m, "PROPTYPE") ?? "?" }, at);
      continue;
    }
    const model = (str(m, "MODELINGTYPE") ?? "ShellThin").toLowerCase();
    const formulation: ShellSection["formulation"] = model === "shellthick" ? "shell-thick" : model === "membrane" ? "membrane" : "shell-thin";
    if (m.pairs.has("MMOD") || m.pairs.has("WMOD")) d.add("info", "shell_modifiers_ignored", {}, at);
    const id = `ss-${shellSections.length + 1}`;
    shellSections.push({ id, name, material: mat, kind: type === "wall" ? "wall" : "slab", formulation, thickness: L(t) });
    shellSecByName.set(name, id);
  }
  count("shellSections", shellRecs.size, shellSections.length);

  // ------------------------------------------------------------------ toạ độ điểm
  const points = new Map<string, { x: number; y: number; dz: number; line: number }>();
  for (const r of e2kSection(file, "POINT COORDINATES")) {
    const name = r.tokens[1]?.text;
    const nums = r.tokens.slice(2).map((t) => e2kNumber(t.text));
    if (!name || nums.length < 2 || nums.some((v) => !Number.isFinite(v))) {
      d.add("error", "point_invalid", {}, { line: r.line, object: name ?? "?" });
      continue;
    }
    if (nums.length > 3) d.add("warning", "point_extra_fields", {}, { line: r.line, object: name });
    points.set(name, { x: nums[0]!, y: nums[1]!, dz: nums[2] ?? 0, line: r.line });
  }

  // Nút NexFEM = (tên điểm, tầng). Cao độ = cao độ tầng − DZ: giá trị thứ ba của POINT đo xuống dưới tầng.
  // Kiểm chứng trên file mẫu: với quy ước này mọi cột đi từ dưới lên (đầu i thấp hơn đầu j).
  const jointKeys = new Map<string, { label: string; story: number; x: number; y: number; z: number }>();
  const useJoint = (pt: string, story: number, at: { line: number; object: string }): string | null => {
    const p = points.get(pt);
    const st = stories[story];
    if (!p || !st) {
      d.add("error", p ? "story_out_of_range" : "point_missing", { point: pt }, at);
      return null;
    }
    const key = `${pt}|${st.name}`;
    if (!jointKeys.has(key)) jointKeys.set(key, { label: pt, story, x: L(p.x), y: L(p.y), z: st.elevation - L(p.dz) });
    return key;
  };

  // ------------------------------------------------------------------ gán điểm (gối)
  const pointAssigns = mergeBy(e2kSection(file, "POINT ASSIGNS"), 2, 3);
  const restraintOf = new Map<string, [boolean, boolean, boolean, boolean, boolean, boolean]>();
  for (const [key, m] of pointAssigns) {
    const [pt, stName] = key.split("|") as [string, string];
    const at = { line: m.lines[0]!, object: `${pt}@${stName}` };
    for (const [k, v] of m.pairs) {
      if (k === "USERJOINT") continue;
      if (k === "RESTRAINT") {
        // Chưa có trong file mẫu: dạng "UX UY UZ RX RY RZ" theo tài liệu ETABS.
        const dofs = ["UX", "UY", "UZ", "RX", "RY", "RZ"];
        const parts = v.text.toUpperCase().split(/\s+/).filter(Boolean);
        const bad = parts.filter((x) => !dofs.includes(x));
        if (bad.length) d.add("warning", "restraint_unknown", { value: v.text }, at);
        const st = storyIndex.get(stName);
        if (st === undefined) continue;
        const jk = useJoint(pt, st, at);
        if (jk) restraintOf.set(jk, dofs.map((x) => parts.includes(x)) as [boolean, boolean, boolean, boolean, boolean, boolean]);
      } else d.add(k === "SPRINGPROP" || k === "DIAPH" || k === "DIAPHRAGM" ? "error" : "warning", "point_assign_unsupported", { key: k }, at);
    }
  }

  // ------------------------------------------------------------------ thanh
  const lineDefs = new Map<string, { kind: string; i: string; j: string; n: number; line: number }>();
  for (const r of e2kSection(file, "LINE CONNECTIVITIES")) {
    const t = r.tokens;
    const name = t[1]?.text;
    const n = e2kNumber(t[5]?.text);
    if (!name || t.length < 6 || !Number.isInteger(n) || n < 0) {
      d.add("error", "line_invalid", {}, { line: r.line, object: name ?? "?" });
      continue;
    }
    lineDefs.set(name, { kind: t[2]!.text.toUpperCase(), i: t[3]!.text, j: t[4]!.text, n, line: r.line });
  }
  const lineAssigns = mergeBy(e2kSection(file, "LINE ASSIGNS"), 2, 3);
  const framesByName = new Map<string, string[]>();
  for (const key of lineAssigns.keys()) {
    const name = key.split("|")[0]!;
    framesByName.set(name, [...(framesByName.get(name) ?? []), key]);
  }
  const frames: Frame[] = [];
  const frameIdByKey = new Map<string, string>();
  // Lò xo dọc thanh (lực/dài²) và lò xo diện tích (lực/dài³) theo trục địa phương 1, 2, 3 (cú pháp từ file mẫu thật).
  type SpringDef = { u: [number, number, number]; nonlinear: boolean; line: number };
  const springDefs = (section: string, head: string) => {
    const out = new Map<string, SpringDef>();
    for (const r of e2kSection(file, section)) {
      if (r.tokens[0]?.text !== head || !r.tokens[1]) continue;
      const p = new Map(e2kPairs(r, 2));
      const u = (["U1", "U2", "U3"] as const).map((k) => (p.has(k) ? e2kNumber(p.get(k)!.text) : 0)) as SpringDef["u"];
      if (u.some((v) => !Number.isFinite(v) || v < 0)) {
        d.add("error", "spring_invalid", {}, { line: r.line, object: r.tokens[1].text });
        continue;
      }
      const nonlinear = [...p.entries()].some(([k, v]) => k.startsWith("NONLINEAROPT") && v.text.toLowerCase() !== "none" && v.text.toLowerCase() !== "linear");
      if (nonlinear) d.add("warning", "spring_compression_only_linear", {}, { line: r.line, object: r.tokens[1].text });
      for (const k of p.keys()) if (!["U1", "U2", "U3", "NOTES"].includes(k) && !k.startsWith("NONLINEAROPT")) d.add("warning", "spring_key_unsupported", { key: k }, { line: r.line, object: r.tokens[1].text });
      out.set(r.tokens[1].text, { u, nonlinear, line: r.line });
    }
    return out;
  };
  const lineSprings = springDefs("LINE SPRING PROPERTIES", "LINESPRING");
  const areaSprings = springDefs("AREA SPRING PROPERTIES", "AREASPRING");
  const frameSpring = new Map<string, string>();
  const autoMeshKeys = new Set<string>();
  const shellSpring = new Map<string, string>();

  const pendingFrames: { key: string; frame: Omit<Frame, "i" | "j">; iKey: string; jKey: string }[] = [];
  let skippedFrames = 0;
  for (const [key, m] of lineAssigns) {
    const [name, stName] = key.split("|") as [string, string];
    const def = lineDefs.get(name);
    const at = { line: m.lines[0]!, object: `${name}@${stName}` };
    if (!def) {
      d.add("error", "line_missing", {}, at);
      continue;
    }
    const kind = def.kind === "COLUMN" ? "column" : def.kind === "BEAM" ? "beam" : def.kind === "BRACE" ? "brace" : null;
    if (!kind) {
      d.add("error", "line_kind_unsupported", { kind: def.kind }, at);
      skippedFrames++;
      continue;
    }
    const secName = str(m, "SECTION");
    const sec = secName ? secByName.get(secName) : undefined;
    if (!sec) {
      d.add("error", secName ? "frame_section_unavailable" : "frame_no_section", { section: secName ?? "?" }, at);
      skippedFrames++;
      continue;
    }
    const st = storyIndex.get(stName);
    if (st === undefined) {
      d.add("error", "story_missing", { story: stName }, at);
      skippedFrames++;
      continue;
    }
    const jKey = useJoint(def.j, st, at);
    const iKey = useJoint(def.i, st - def.n, at);
    if (!iKey || !jKey) {
      skippedFrames++;
      continue;
    }
    const frame: Omit<Frame, "i" | "j"> = {
      id: "",
      label: (framesByName.get(name)?.length ?? 0) > 1 ? `${name}@${stName}` : name,
      kind,
      section: sec,
      story: stories[st]!.id,
    };
    // Nhả liên kết.
    const rel = str(m, "RELEASE");
    if (rel) {
      const i = [false, false, false, false, false, false];
      const j = [false, false, false, false, false, false];
      if (rel.toUpperCase() === "PINNED") {
        // Giả định: "PINNED" = nhả M2, M3 ở cả hai đầu (không nhả xoắn). Cần đối chiếu với ETABS.
        i[4] = i[5] = j[4] = j[5] = true;
        d.add("info", "release_pinned_assumption", {}, at);
      } else {
        for (const tok of rel.toUpperCase().split(/\s+/).filter(Boolean)) {
          const mm = /^(P|V2|V3|T|M2|M3)(I|J)$/.exec(tok);
          if (!mm) {
            d.add("warning", "release_unknown", { token: tok }, at);
            continue;
          }
          (mm[2] === "I" ? i : j)[RELEASE_DOF.indexOf(mm[1] as (typeof RELEASE_DOF)[number])] = true;
        }
      }
      if (i.some(Boolean) || j.some(Boolean)) frame.releases = { i, j };
    }
    // Thuộc tính chưa hỗ trợ.
    for (const [k, v] of m.pairs) {
      if (k === "SECTION" || k === "RELEASE" || LINE_KEYS_IGNORED.has(k)) continue;
      const val = e2kNumber(v.text);
      if (k === "LENGTHOFFI" || k === "LENGTHOFFJ") {
        if (val !== 0) d.add("warning", "frame_length_offset_ignored", {}, at);
      } else if (k === "ANG") {
        // Góc xoay trục địa phương: cùng quy ước CSI với NexFEM (schema Frame.angle, fem-solver local_axes).
        if (!Number.isFinite(val)) d.add("warning", "frame_key_unsupported", { key: k }, at);
        else if (val !== 0) {
          frame.angle = val;
          d.add("info", "frame_angle_imported", {}, at);
        }
      } else if (k === "CARDINALPT") {
        if (val !== 10) d.add("warning", "frame_cardinal_ignored", { point: v.text }, at);
      } else if (k === "SPRINGPROP") {
        if (lineSprings.has(v.text)) frameSpring.set(key, v.text);
        else d.add("error", "frame_spring_unsupported", { spring: v.text }, at);
      } else if (k === "LIMITCOMPRESSION" || k === "LIMITTENSION") d.add("warning", "frame_limit_ignored", { key: k }, at);
      else if (k === "PARFIXM3I" || k === "PARFIXM3J" || k === "PARFIXM2I" || k === "PARFIXM2J") d.add("warning", "frame_partial_fixity_ignored", {}, at);
      else d.add("warning", "frame_key_unsupported", { key: k }, at);
    }
    if ((str(m, "AUTOMESH") ?? "").toUpperCase() === "YES") autoMeshKeys.add(key);
    pendingFrames.push({ key, frame, iKey, jKey });
  }

  // ------------------------------------------------------------------ sàn / vách
  const areaDefs = new Map<string, { kind: string; pts: string[]; offs: number[]; line: number }>();
  for (const r of e2kSection(file, "AREA CONNECTIVITIES")) {
    const t = r.tokens;
    const name = t[1]?.text;
    const n = e2kNumber(t[3]?.text);
    if (!name || !Number.isInteger(n) || n < 3 || t.length < 4 + 2 * n) {
      d.add("error", "area_invalid", {}, { line: r.line, object: name ?? "?" });
      continue;
    }
    areaDefs.set(name, { kind: t[2]!.text.toUpperCase(), pts: t.slice(4, 4 + n).map((x) => x.text), offs: t.slice(4 + n, 4 + 2 * n).map((x) => e2kNumber(x.text)), line: r.line });
  }
  const areaAssigns = mergeBy(e2kSection(file, "AREA ASSIGNS"), 2, 3);
  const areasByName = new Map<string, number>();
  for (const key of areaAssigns.keys()) areasByName.set(key.split("|")[0]!, (areasByName.get(key.split("|")[0]!) ?? 0) + 1);
  const pendingShells: { key: string; shell: Omit<Shell, "joints">; jointKeys: string[] }[] = [];
  let skippedShells = 0;
  for (const [key, m] of areaAssigns) {
    const [name, stName] = key.split("|") as [string, string];
    const def = areaDefs.get(name);
    const at = { line: m.lines[0]!, object: `${name}@${stName}` };
    if (!def) {
      d.add("error", "area_missing", {}, at);
      continue;
    }
    if (def.kind !== "FLOOR") {
      d.add("error", "area_kind_unsupported", { kind: def.kind }, at);
      skippedShells++;
      continue;
    }
    const secName = str(m, "SECTION");
    const sec = secName ? shellSecByName.get(secName) : undefined;
    const st = storyIndex.get(stName);
    if (!sec || st === undefined) {
      d.add("error", sec ? "story_missing" : "area_section_unavailable", { section: secName ?? "?", story: stName }, at);
      skippedShells++;
      continue;
    }
    const keys = def.pts.map((p, k) => useJoint(p, st - (Number.isInteger(def.offs[k]) ? def.offs[k]! : 0), at));
    if (keys.some((k) => !k)) {
      skippedShells++;
      continue;
    }
    for (const [k, v] of m.pairs) {
      if (k === "SECTION" || AREA_KEYS_IGNORED.has(k)) continue;
      if (k === "ADDRESTRAINT") {
        if (v.text.toLowerCase() !== "no") d.add("error", "area_restraint_unsupported", {}, at);
      } else if (k === "SPRINGPROP") {
        if (areaSprings.has(v.text)) shellSpring.set(key, v.text);
        else d.add("error", "area_spring_unsupported", { spring: v.text }, at);
      } else d.add("warning", "area_key_unsupported", { key: k }, at);
    }
    if (m.pairs.has("MASS")) d.add("info", "area_mass_ignored", {}, at);
    pendingShells.push({
      key,
      shell: { id: "", label: (areasByName.get(name) ?? 0) > 1 ? `${name}@${stName}` : name, kind: "slab", section: sec, story: stories[st]!.id },
      jointKeys: keys as string[],
    });
  }

  // ------------------------------------------------------------------ gộp nút trùng (dung sai MERGETOL của file)
  const tolM = mergeTol > 0 ? L(mergeTol) : 1e-6;
  const canonical = new Map<string, string>(); // jointKey -> jointKey đại diện
  const grid = new Map<string, string[]>();
  const cell = (v: number) => Math.floor(v / tolM);
  let merged = 0;
  for (const [key, j] of jointKeys) {
    const cx = cell(j.x);
    const cy = cell(j.y);
    const cz = cell(j.z);
    let found: string | undefined;
    for (let a = -1; a <= 1 && !found; a++)
      for (let b = -1; b <= 1 && !found; b++)
        for (let c = -1; c <= 1 && !found; c++) {
          for (const other of grid.get(`${cx + a},${cy + b},${cz + c}`) ?? []) {
            const o = jointKeys.get(other)!;
            if (Math.hypot(o.x - j.x, o.y - j.y, o.z - j.z) <= tolM) {
              found = other;
              break;
            }
          }
        }
    if (found) {
      canonical.set(key, found);
      merged++;
      continue;
    }
    canonical.set(key, key);
    const ck = `${cx},${cy},${cz}`;
    grid.set(ck, [...(grid.get(ck) ?? []), key]);
  }
  if (merged) d.add("info", "joints_merged", { count: merged, tol: mergeTol });

  // Nhãn nút: tên điểm ETABS; điểm dùng ở nhiều tầng thì thêm "@tầng".
  const labelUse = new Map<string, number>();
  for (const [key, rep] of canonical) if (key === rep) labelUse.set(jointKeys.get(key)!.label, (labelUse.get(jointKeys.get(key)!.label) ?? 0) + 1);
  const joints: Joint[] = [];
  const jointId = new Map<string, string>();
  for (const [key, rep] of canonical) {
    if (key !== rep) continue;
    const j = jointKeys.get(key)!;
    const id = `j-${joints.length + 1}`;
    const st = stories[j.story]!;
    const joint: Joint = { id, label: (labelUse.get(j.label) ?? 0) > 1 ? `${j.label}@${st.name}` : j.label, x: round(j.x), y: round(j.y), z: round(j.z), story: st.id };
    const r = restraintOf.get(key);
    if (r?.some(Boolean)) joint.restraint = r;
    joints.push(joint);
    jointId.set(key, id);
  }
  // Gối gán cho điểm đã bị gộp: chuyển sang nút đại diện.
  for (const [key, r] of restraintOf) {
    const rep = canonical.get(key);
    const id = rep ? jointId.get(rep) : undefined;
    const joint = id ? joints.find((x) => x.id === id) : undefined;
    if (joint && !joint.restraint && r.some(Boolean)) joint.restraint = r;
  }
  const jid = (key: string) => jointId.get(canonical.get(key) ?? key)!;
  const mappingJoints: Record<string, string> = {};
  for (const key of canonical.keys()) mappingJoints[key] = jid(key);

  for (const p of pendingFrames) {
    const i = jid(p.iKey);
    const j = jid(p.jKey);
    if (i === j) {
      d.add("error", "frame_zero_length", {}, { object: p.frame.label });
      skippedFrames++;
      continue;
    }
    const id = `f-${frames.length + 1}`;
    frames.push({ ...p.frame, id, i, j });
    frameIdByKey.set(p.key, id);
  }
  count("frames", lineAssigns.size, frames.length);
  void skippedFrames;

  const shells: Shell[] = [];
  const shellIdByKey = new Map<string, string>();
  for (const p of pendingShells) {
    const ids = p.jointKeys.map(jid).filter((x, k, a) => a.indexOf(x) === k);
    if (ids.length < 3) {
      d.add("error", "area_degenerate", {}, { object: p.shell.label });
      skippedShells++;
      continue;
    }
    const id = `s-${shells.length + 1}`;
    shells.push({ ...p.shell, id, joints: ids });
    shellIdByKey.set(p.key, id);
  }
  count("shells", areaAssigns.size, shells.length);
  void skippedShells;

  // ------------------------------------------------------------------ chia thanh tại nút nằm trên thân thanh
  // ETABS tự chia thanh (AUTOMESH "YES") tại đầu thanh khác hoặc góc sàn nằm trên thân thanh; không chia thì thanh tựa lên
  // thân thanh khác sẽ treo lơ lửng (mất ổn định). Tải trên thanh gốc được chuyển sang các đoạn ở cuối bộ nhập.
  const autoHosts = new Set([...frameIdByKey].filter(([k]) => autoMeshKeys.has(k)).map(([, id]) => id));
  const split = splitFramesAtJoints(frames, joints, shells.flatMap((s) => s.joints), (f) => autoHosts.has(f.id), tolM);
  frames.splice(0, frames.length, ...split.frames);
  if (split.segments.size) d.add("info", "frames_split", { hosts: split.segments.size, segments: [...split.segments.values()].reduce((t, l) => t + l.length, 0) });

  // ------------------------------------------------------------------ lò xo dọc thanh / diện tích → lò xo nút
  // NexFEM chưa có phần tử nền đàn hồi: quy về lò xo nút (hệ tổng thể). Thanh: mỗi đầu k·L/2 theo trục địa phương;
  // sàn: k·(diện tích chịu tải của góc). Chỉ nhận được khi trục địa phương trùng một trục tổng thể.
  const jointById = new Map(joints.map((j) => [j.id, j]));
  const addSpring = (id: string, axis: number, k: number) => {
    const j = jointById.get(id)!;
    const s: NonNullable<Joint["springs"]> = j.springs ?? [0, 0, 0, 0, 0, 0];
    s[axis as 0 | 1 | 2] += k;
    j.springs = s;
  };
  for (const f of frames) {
    const hostId = split.hostOf.get(f.id) ?? f.id;
    const key = [...frameIdByKey].find(([, id]) => id === hostId)?.[0];
    const name = key ? frameSpring.get(key) : undefined;
    if (!name) continue;
    const def = lineSprings.get(name)!;
    const a = jointById.get(f.i)!;
    const b = jointById.get(f.j)!;
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const axes = frameAxes(a, b, f.angle ?? 0);
    let ok = true;
    def.u.forEach((k, c) => {
      if (!(k > 0)) return;
      const g = globalAxisOf(axes[c]!);
      if (g < 0) {
        ok = false;
        return;
      }
      const kn = (conv.stress(U, k) * len) / 2;
      addSpring(f.i, g, kn);
      addSpring(f.j, g, kn);
    });
    if (ok) d.add("warning", "frame_spring_lumped", {}, { object: f.label });
    else d.add("error", "spring_direction_unsupported", {}, { object: f.label });
  }
  // Nút có thanh nối vào: ứng viên để chia tấm tại chỗ (nút chỉ là góc sàn đã có trong đa giác).
  const frameNodes = new Set(frames.flatMap((f) => [f.i, f.j]));
  const connectedJoints = joints.filter((j) => frameNodes.has(j.id));
  for (const s of shells) {
    const key = [...shellIdByKey].find(([, id]) => id === s.id)?.[0];
    const name = key ? shellSpring.get(key) : undefined;
    if (!name) continue;
    const def = areaSprings.get(name)!;
    const pts = s.joints.map((id) => jointById.get(id)!);
    const nrm: [number, number, number] = [0, 0, 0];
    pts.forEach((p, k) => {
      const q = pts[(k + 1) % pts.length]!;
      nrm[0] += (p.y - q.y) * (p.z + q.z);
      nrm[1] += (p.z - q.z) * (p.x + q.x);
      nrm[2] += (p.x - q.x) * (p.y + q.y);
    });
    const nl = Math.hypot(...nrm);
    // Sàn ngang: trục 3 = Z; trục 1, 2 trong mặt phẳng lấy theo X, Y (trục mặc định của sàn ETABS).
    if (Math.abs(nrm[2]) / nl < 1 - 1e-6) {
      d.add("error", "spring_direction_unsupported", {}, { object: s.label });
      continue;
    }
    if (def.u[0] !== def.u[1]) d.add("warning", "area_spring_inplane_assumed", {}, { object: s.label });
    // ETABS chia tấm tại nút nằm bên trong (ví dụ chân cột giữa móng): nút đó nhận phần lò xo của mình.
    const shares = meshedNodeAreas(pts, connectedJoints, tolM);
    const assignArea = (id: string, area: number) => def.u.forEach((ku, c) => ku > 0 && addSpring(id, c, conv.unitWeight(U, ku) * area));
    if (shares) shares.forEach((area, id) => assignArea(id, area));
    else {
      d.add("warning", "area_spring_mesh_failed", {}, { object: s.label });
      cornerAreas(pts).forEach((area, k) => assignArea(pts[k]!.id, area));
    }
    const inner = shares ? [...shares.keys()].filter((id) => !s.joints.includes(id)) : [];
    if (inner.length) d.add("info", "area_spring_interior_nodes", {}, { object: `${s.label} (${inner.map((id) => jointById.get(id)!.label).join(", ")})` });
    d.add("warning", "area_spring_lumped", {}, { object: s.label });
  }
  for (const j of joints) if (j.springs) j.springs = j.springs.map((v) => (v === 0 ? 0 : Number(v.toPrecision(12)))) as NonNullable<Joint["springs"]>;
  count("joints", points.size, joints.length);

  // ------------------------------------------------------------------ mẫu tải
  const patterns: LoadPattern[] = [];
  const patByName = new Map<string, string>();
  const patRecs = e2kSection(file, "LOAD PATTERNS");
  for (const r of patRecs) {
    const name = r.tokens[1]?.text ?? "";
    const p = new Map(e2kPairs(r, 2));
    const t = (p.get("TYPE")?.text ?? "").toLowerCase();
    const type: LoadPattern["type"] =
      t === "dead" ? "dead" : t === "super dead" ? "superDead" : t === "live" || t === "roof live" || t === "reducible live" ? "live" : t === "wind" ? "wind" : t === "seismic" || t === "quake" ? "seismic" : "other";
    if (t !== "dead" && t !== "super dead" && t !== "live" && t !== "wind" && t !== "seismic") d.add("info", "pattern_type_mapped", { from: p.get("TYPE")?.text ?? "?", to: type }, { line: r.line, object: name });
    const sw = e2kNumber(p.get("SELFWEIGHT")?.text);
    const id = `lp-${patterns.length + 1}`;
    patterns.push({ id, name, type, selfWeight: Number.isFinite(sw) && sw >= 0 ? sw : 0 });
    patByName.set(name, id);
  }
  count("loadPatterns", patRecs.length, patterns.length);

  // ------------------------------------------------------------------ tải trên thanh
  const frameLoads: FrameLoad[] = [];
  const lineLoadRecs = e2kSection(file, "FRAME OBJECT LOADS");
  // Trục địa phương 1, 2, 3 của NexFEM theo quy ước CSI (mặc định và góc ANG), nên tải theo trục 2, 3 nhập thẳng.
  const DIRS: Record<string, FrameLoad["direction"]> = { GRAV: "gravity", X: "globalX", Y: "globalY", Z: "globalZ", "1": "localX", "2": "local2", "3": "local3" };
  for (const r of lineLoadRecs) {
    const name = r.tokens[1]?.text ?? "";
    const stName = r.tokens[2]?.text ?? "";
    const p = new Map(e2kPairs(r, 3));
    const at = { line: r.line, object: `${name}@${stName}` };
    const frame = frameIdByKey.get(`${name}|${stName}`);
    const pat = patByName.get(p.get("LC")?.text ?? "");
    const dir = DIRS[(p.get("DIR")?.text ?? "").toUpperCase()];
    const type = (p.get("TYPE")?.text ?? "").toUpperCase();
    if (!frame || !pat) {
      d.add("error", "load_target_missing", { kind: "frame" }, at);
      continue;
    }
    if (!dir) {
      d.add("error", "line_load_unsupported", { type, dir: p.get("DIR")?.text ?? "?" }, at);
      continue;
    }
    if (dir === "local2" || dir === "local3") d.add("info", "line_load_local_axis_note", {}, at);
    let w: number;
    if (type === "UNIFF") w = e2kNumber(p.get("FVAL")?.text);
    else if (type === "TRAPF") {
      const fs = e2kNumber(p.get("FSTART")?.text);
      const fe = e2kNumber(p.get("FEND")?.text);
      const rs = e2kNumber(p.get("RDSTART")?.text);
      const re = e2kNumber(p.get("RDEND")?.text);
      if (![fs, fe, rs, re].every(Number.isFinite) || re < rs) {
        d.add("error", "line_load_unsupported", { type, dir: p.get("DIR")?.text ?? "?" }, at);
        continue;
      }
      // NexFEM chỉ có tải đều suốt chiều dài: giữ nguyên tổng lực (hợp lực) của tải hình thang trên đoạn [rs, re].
      w = ((fs + fe) / 2) * (re - rs);
      if (fs !== fe || rs > 1e-9 || re < 1 - 1e-9) d.add("warning", "line_load_approximated", {}, at);
    } else {
      d.add("error", "line_load_unsupported", { type, dir: p.get("DIR")?.text ?? "?" }, at);
      continue;
    }
    if (!Number.isFinite(w)) {
      d.add("error", "line_load_unsupported", { type, dir: p.get("DIR")?.text ?? "?" }, at);
      continue;
    }
    frameLoads.push({ id: `fl-${frameLoads.length + 1}`, frame, pattern: pat, kind: "distributed", direction: dir, value: conv.forcePerLength(U, w) });
  }
  count("frameLoads", lineLoadRecs.length, frameLoads.length);

  // ------------------------------------------------------------------ tải trên sàn
  const shellLoads: ShellLoad[] = [];
  const areaLoadRecs = e2kSection(file, "SHELL OBJECT LOADS");
  for (const r of areaLoadRecs) {
    const name = r.tokens[1]?.text ?? "";
    const stName = r.tokens[2]?.text ?? "";
    const p = new Map(e2kPairs(r, 3));
    const at = { line: r.line, object: `${name}@${stName}` };
    const shell = shellIdByKey.get(`${name}|${stName}`);
    const pat = patByName.get(p.get("LC")?.text ?? "");
    const type = (p.get("TYPE")?.text ?? "").toUpperCase();
    const dirRaw = (p.get("DIR")?.text ?? "").toUpperCase();
    const v = e2kNumber(p.get("FVAL")?.text);
    if (!shell || !pat) {
      d.add("error", "load_target_missing", { kind: "area" }, at);
      continue;
    }
    if (type !== "UNIFF" || (dirRaw !== "GRAV" && dirRaw !== "Z") || !Number.isFinite(v)) {
      d.add("error", "area_load_unsupported", { type, dir: dirRaw }, at);
      continue;
    }
    // GRAV dương hướng xuống; Z dương hướng lên.
    shellLoads.push({ id: `sl-${shellLoads.length + 1}`, shell, pattern: pat, direction: dirRaw === "GRAV" ? "gravity" : "globalZ", value: conv.stress(U, v) });
  }
  count("shellLoads", areaLoadRecs.length, shellLoads.length);

  // ------------------------------------------------------------------ tải tập trung tại nút (hệ tổng thể)
  const jointLoads: JointLoad[] = [];
  let convertedToFrame = 0;
  const pointLoadRecs = e2kSection(file, "POINT OBJECT LOADS");
  const PL_KEYS = ["FX", "FY", "FZ", "MX", "MY", "MZ"] as const;
  for (const r of pointLoadRecs) {
    const pt = r.tokens[1]?.text ?? "?";
    const stName = r.tokens[2]?.text ?? "?";
    const at = { line: r.line, object: `${pt}@${stName}` };
    const p = new Map(e2kPairs(r, 3));
    const type = (p.get("TYPE")?.text ?? "").toUpperCase();
    const pat = patByName.get(p.get("LC")?.text ?? "");
    const key = `${pt}|${stName}`;
    if (type !== "FORCE") {
      d.add("error", "point_load_type_unsupported", { type: p.get("TYPE")?.text ?? "?" }, at);
      continue;
    }
    if (!pat) {
      d.add("error", "load_target_missing", { kind: "joint" }, at);
      continue;
    }
    for (const k of p.keys()) if (k !== "TYPE" && k !== "LC" && !(PL_KEYS as readonly string[]).includes(k)) d.add("warning", "point_load_key_unsupported", { key: k }, at);
    const raw = PL_KEYS.map((k) => (p.has(k) ? e2kNumber(p.get(k)!.text) : 0));
    if (raw.some((v) => !Number.isFinite(v))) {
      d.add("error", "point_load_type_unsupported", { type }, at);
      continue;
    }
    const values = raw.map((v, i) => (i < 3 ? conv.force(U, v) : conv.force(U, v) * U.l)) as JointLoad["values"];
    if (jointKeys.has(key)) {
      jointLoads.push({ id: `jl-${jointLoads.length + 1}`, joint: jid(key), pattern: pat, values });
      continue;
    }
    // Điểm riêng (không phải đầu thanh/sàn): ETABS tự chia thanh tại điểm nằm trên thanh, nên định vị theo toạ độ.
    const pp = points.get(pt);
    const st = stories.find((s) => s.name === stName);
    const place = pp && st ? locatePoint({ x: L(pp.x), y: L(pp.y), z: st.elevation - L(pp.dz) }, joints, frames, tolM) : null;
    if (!place) {
      d.add("error", "point_load_no_joint", {}, at);
      continue;
    }
    if ("joint" in place) {
      jointLoads.push({ id: `jl-${jointLoads.length + 1}`, joint: place.joint.id, pattern: pat, values });
      d.add("info", "point_load_at_joint", {}, { ...at, object: `${at.object} → ${place.joint.label}` });
      continue;
    }
    if (values.slice(3).some((v) => v !== 0)) {
      d.add("error", "point_load_moment_on_frame", {}, at);
      continue;
    }
    const DIR3 = ["globalX", "globalY", "globalZ"] as const;
    values.slice(0, 3).forEach((v, c) => {
      if (v !== 0) frameLoads.push({ id: `fl-${frameLoads.length + 1}`, frame: place.frame.id, pattern: pat, kind: "point", direction: DIR3[c]!, value: v, at: place.at });
    });
    convertedToFrame++;
    d.add("warning", "point_load_on_frame", {}, { ...at, object: `${at.object} → ${place.frame.label} @ ${place.at.toFixed(3)}` });
  }
  count("pointLoads", pointLoadRecs.length, jointLoads.length + convertedToFrame);

  // ------------------------------------------------------------------ trường hợp tải
  const caseRecs = mergeBy(e2kSection(file, "LOAD CASES"), 1, 2);
  const loadCases: LoadCase[] = [];
  const caseByName = new Map<string, string>();
  for (const [name, m] of caseRecs) {
    const type = (str(m, "TYPE") ?? "").toLowerCase();
    const at = { line: m.lines[0]!, object: name };
    const kind: LoadCase["type"] | null = type === "linear static" ? "linearStatic" : type.startsWith("modal") ? "modal" : null;
    if (!kind) {
      d.add("error", "case_unsupported", { type: str(m, "TYPE") ?? "?" }, at);
      continue;
    }
    const init = (str(m, "INITCOND") ?? "NONE").toUpperCase();
    if (init !== "NONE" && init !== "PRESET") d.add("warning", "case_initcond_ignored", { value: init }, at);
    const loads: LoadCase["loads"] = [];
    let pending: string | null = null;
    for (const [k, v] of m.all) {
      if (k === "LOADPAT") pending = v.text;
      else if (k === "SF" && pending !== null) {
        const pat = patByName.get(pending);
        const sf = e2kNumber(v.text);
        if (pat && Number.isFinite(sf)) loads.push({ pattern: pat, factor: sf });
        else d.add("warning", "case_item_missing", { pattern: pending }, at);
        pending = null;
      }
    }
    const id = `lc-${loadCases.length + 1}`;
    loadCases.push({ id, name, type: kind, loads });
    caseByName.set(name, id);
  }
  count("loadCases", caseRecs.size, loadCases.length);

  // ------------------------------------------------------------------ tổ hợp
  const comboRecs = mergeBy(e2kSection(file, "LOAD COMBINATIONS"), 1, 2);
  const COMBO_TYPES: Record<string, LoadCombo["type"]> = { "linear add": "linearAdd", envelope: "envelope", srss: "srss", "absolute add": "absAdd" };
  const comboId = new Map<string, string>();
  const supportedCombos = [...comboRecs].filter(([, m]) => COMBO_TYPES[(str(m, "TYPE") ?? "").toLowerCase()]);
  supportedCombos.forEach(([name], k) => comboId.set(name, `co-${k + 1}`));
  const combos: LoadCombo[] = [];
  for (const [name, m] of comboRecs) {
    const at = { line: m.lines[0]!, object: name };
    const type = COMBO_TYPES[(str(m, "TYPE") ?? "").toLowerCase()];
    if (!type) {
      d.add("error", "combo_type_unsupported", { type: str(m, "TYPE") ?? "?" }, at);
      continue;
    }
    const items: LoadCombo["items"] = [];
    let ref: { name: string; combo: boolean } | null = null;
    for (const [k, v] of m.all) {
      if (k === "LOADCASE" || k === "LOADCOMBO") ref = { name: v.text, combo: k === "LOADCOMBO" };
      else if (k === "SF" && ref) {
        const target = ref.combo ? comboId.get(ref.name) : caseByName.get(ref.name);
        const sf = e2kNumber(v.text);
        if (target && Number.isFinite(sf)) items.push({ case: target, factor: sf });
        else d.add("warning", "combo_item_missing", { item: ref.name }, at);
        ref = null;
      } else if (k === "DESIGN" || k === "COMBOTYPE") d.add("info", "combo_design_ignored", {}, at);
    }
    combos.push({ id: comboId.get(name)!, name, type, items });
  }
  count("combos", comboRecs.size, combos.length);

  // ------------------------------------------------------------------ tuỳ chọn phân tích, sàn cứng, phần bỏ qua
  for (const r of e2kSection(file, "ANALYSIS OPTIONS")) {
    const head = r.tokens[0]?.text;
    const p = new Map(e2kPairs(r, 1));
    if (head === "PDELTA" && (p.get("METHOD")?.text ?? "NONE").toUpperCase() !== "NONE") d.add("warning", "pdelta_ignored", { method: p.get("METHOD")!.text }, { line: r.line });
    if (head === "ACTIVEDOF" && r.tokens[1]?.text.toUpperCase().replace(/\s+/g, " ").trim() !== "UX UY UZ RX RY RZ") d.add("warning", "activedof_ignored", { value: r.tokens[1]?.text ?? "" }, { line: r.line });
  }
  const diaphragms = e2kSection(file, "DIAPHRAGM NAMES");
  if (diaphragms.length) d.add("info", "diaphragm_defined", { count: diaphragms.length });
  for (const [name, recs] of file.sections) {
    if (SECTIONS_USED.has(name) || name.startsWith("STORIES") || !recs.length) continue;
    d.add("info", "section_ignored", { section: name, records: recs.length }, { line: file.sectionLines.get(name) });
  }
  if (!joints.some((j) => j.restraint?.some(Boolean) || j.springs?.some((k) => k > 0))) d.add("error", "no_supports_imported");

  const model = parseModel({
    schemaVersion: MODEL_SCHEMA_VERSION,
    name: opts.name ?? (title || "ETABS"),
    units: { force: "kN", length: "m", temperature: U.temperature === "F" ? "F" : "C" },
    designCodes: {},
    grids,
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
    frameLoads: remapFrameLoads(frameLoads, split.segments),
    shellLoads,
    jointLoads,
  } satisfies Model);

  return {
    model,
    report: {
      program,
      version,
      units: { force: U.force, length: U.length, temperature: U.temperature },
      counts,
      diagnostics: d.list(),
      mapping: { joints: mappingJoints, frames: Object.fromEntries([...frameIdByKey].map(([k, id]) => [k, split.segments.get(id)?.[0]?.id ?? id])), shells: Object.fromEntries(shellIdByKey) },
    },
  };
}

/** Làm tròn 12 chữ số có nghĩa để toạ độ đổi đơn vị không mang sai số dấu phẩy động (7.62 thay vì 7.619999…). */
function round(v: number): number {
  return v === 0 ? 0 : Number(v.toPrecision(12));
}

function emptyImported(name: string): Model {
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
    jointLoads: [],
  } satisfies Model);
}
