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
  type ShellSection,
  type Story,
} from "@nexfem/model-core";
import { e2kNumber, e2kPairs, e2kSection, parseE2k, type E2kFile, type E2kRecord, type E2kToken } from "./e2k-parse.ts";
import { conv, unitFactors, type UnitFactors } from "./units.ts";

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

export type ImportLevel = "error" | "warning" | "info";

export interface ImportDiagnostic {
  level: ImportLevel;
  /** Mã để giao diện dịch; tham số trong `params`. */
  code: string;
  params: Record<string, string | number>;
  /** Số lần gặp. */
  count: number;
  /** Tối đa 20 số dòng trong file. */
  lines: number[];
  /** Tối đa 20 tên đối tượng ETABS. */
  objects: string[];
}

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

const MAX_LIST = 20;

class Diagnostics {
  #map = new Map<string, ImportDiagnostic>();
  add(level: ImportLevel, code: string, params: Record<string, string | number> = {}, at?: { line?: number; object?: string }): void {
    const key = `${level}|${code}|${JSON.stringify(params)}`;
    let d = this.#map.get(key);
    if (!d) {
      d = { level, code, params, count: 0, lines: [], objects: [] };
      this.#map.set(key, d);
    }
    d.count++;
    if (at?.line !== undefined && d.lines.length < MAX_LIST) d.lines.push(at.line);
    if (at?.object !== undefined && d.objects.length < MAX_LIST && !d.objects.includes(at.object)) d.objects.push(at.object);
  }
  list(): ImportDiagnostic[] {
    const rank: Record<ImportLevel, number> = { error: 0, warning: 1, info: 2 };
    return [...this.#map.values()].sort((a, b) => rank[a.level] - rank[b.level]);
  }
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
    }
    if (!geometry) {
      d.add("error", "section_unsupported", { shape: shape || "?" }, at);
      continue;
    }
    const id = `fs-${frameSections.length + 1}`;
    frameSections.push({ id, name, material: mat, geometry });
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
        if (val !== 0) d.add("warning", "frame_angle_ignored", { angle: v.text }, at);
      } else if (k === "CARDINALPT") {
        if (val !== 10) d.add("warning", "frame_cardinal_ignored", { point: v.text }, at);
      } else if (k === "SPRINGPROP") d.add("error", "frame_spring_unsupported", { spring: v.text }, at);
      else if (k === "LIMITCOMPRESSION" || k === "LIMITTENSION") d.add("warning", "frame_limit_ignored", { key: k }, at);
      else if (k === "PARFIXM3I" || k === "PARFIXM3J" || k === "PARFIXM2I" || k === "PARFIXM2J") d.add("warning", "frame_partial_fixity_ignored", {}, at);
      else d.add("warning", "frame_key_unsupported", { key: k }, at);
    }
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
      } else if (k === "SPRINGPROP") d.add("error", "area_spring_unsupported", { spring: v.text }, at);
      else d.add("warning", "area_key_unsupported", { key: k }, at);
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

  // ------------------------------------------------------------------ tải tập trung tại nút (NexFEM chưa có)
  const pointLoadRecs = e2kSection(file, "POINT OBJECT LOADS");
  for (const r of pointLoadRecs) {
    const p = new Map(e2kPairs(r, 3));
    d.add("error", "point_loads_unsupported", { pattern: p.get("LC")?.text ?? "?" }, { line: r.line, object: `${r.tokens[1]?.text ?? "?"}@${r.tokens[2]?.text ?? "?"}` });
  }
  count("pointLoads", pointLoadRecs.length, 0);

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
  if (!joints.some((j) => j.restraint?.some(Boolean))) d.add("error", "no_supports_imported");

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
      mapping: { joints: mappingJoints, frames: Object.fromEntries(frameIdByKey), shells: Object.fromEntries(shellIdByKey) },
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
  } satisfies Model);
}
