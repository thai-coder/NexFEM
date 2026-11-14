import { frameLength, jointMap } from "./query.ts";
import { sectionProperties } from "./sections.ts";
import type { Model } from "./schema.ts";

export type MessageLevel = "error" | "warning" | "info";

export interface ModelMessage {
  level: MessageLevel;
  /** Mã thông điệp, giao diện dịch theo mã này. */
  code:
    | "missing_joint"
    | "missing_section"
    | "missing_material"
    | "zero_length"
    | "duplicate_joint"
    | "duplicate_frame"
    | "no_supports"
    | "unused_section"
    | "invalid_section"
    | "invalid_releases"
    | "missing_load_target"
    | "missing_load_pattern"
    | "missing_load_case"
    | "invalid_combo_cycle"
    | "invalid_offsets"
    | "invalid_diaphragm";
  /** Đối tượng liên quan, để nhảy tới khi bấm vào thông điệp. */
  objects: string[];
  params?: Record<string, string | number>;
}

/** Kiểm tra mô hình trước khi phân tích (Analyze → Check model). */
export function checkModel(model: Model): ModelMessage[] {
  const out: ModelMessage[] = [];
  const joints = jointMap(model);
  const frameSections = new Set(model.frameSections.map((s) => s.id));
  const shellSections = new Set(model.shellSections.map((s) => s.id));
  const materials = new Set(model.materials.map((m) => m.id));
  const patterns = new Set(model.loadPatterns.map((p) => p.id));
  const cases = new Set(model.loadCases.map((c) => c.id));
  const combos = new Map(model.combos.map((c) => [c.id, c]));

  for (const s of [...model.frameSections, ...model.shellSections]) {
    if (!materials.has(s.material)) out.push({ level: "error", code: "missing_material", objects: [s.id], params: { name: s.name } });
  }

  // Một tiết diện hợp lệ về schema (các chiều > 0) vẫn có thể vô lý về hình học.
  for (const sec of model.frameSections) {
    const g = sec.geometry;
    const invalid = g.shape === "I" ? (2 * g.tf + 2 * (g.r ?? 0) >= g.h || g.tw + 2 * (g.r ?? 0) >= g.bf)
      : g.shape === "box" ? (2 * g.t >= g.h || 2 * g.t >= g.b || (g.r ?? 0) > Math.min(g.h, g.b) / 2)
      : g.shape === "pipe" ? (2 * g.t >= g.d) : false;
    const area = g.shape === "rect" ? g.b * g.h
      : g.shape === "circle" ? Math.PI * g.d ** 2 / 4
      : g.shape === "I" ? sectionProperties(g).A
      : g.shape === "box" ? sectionProperties(g).A
      : Math.PI * (g.d ** 2 - (g.d - 2 * g.t) ** 2) / 4;
    const badShear = sec.shearAreas && (sec.shearAreas.a2 > area || sec.shearAreas.a3 > area);
    if (invalid || badShear) out.push({ level: "error", code: "invalid_section", objects: [sec.id], params: { name: sec.name } });
  }

  const pairs = new Map<string, string>();
  for (const f of model.frames) {
    if (!joints.has(f.i) || !joints.has(f.j)) {
      out.push({ level: "error", code: "missing_joint", objects: [f.id], params: { label: f.label } });
      continue;
    }
    if (!frameSections.has(f.section)) out.push({ level: "error", code: "missing_section", objects: [f.id], params: { label: f.label } });
    if (f.releases && [0, 1, 2, 3].some((i) => f.releases!.i[i] && f.releases!.j[i]))
      out.push({ level: "error", code: "invalid_releases", objects: [f.id], params: { name: f.label } });
    const fullLength = frameLength(f, joints);
    if (fullLength < 1e-6) out.push({ level: "error", code: "zero_length", objects: [f.id], params: { label: f.label } });
    if (f.offsets && f.offsets.i + f.offsets.j >= fullLength - 1e-6)
      out.push({ level: "error", code: "invalid_offsets", objects: [f.id], params: { name: f.label } });
    const key = [f.i, f.j].sort().join("|");
    const prev = pairs.get(key);
    if (prev) out.push({ level: "warning", code: "duplicate_frame", objects: [prev, f.id], params: { label: f.label } });
    else pairs.set(key, f.id);
  }

  for (const s of model.shells) {
    if (s.joints.some((j) => !joints.has(j))) out.push({ level: "error", code: "missing_joint", objects: [s.id], params: { label: s.label } });
    if (!shellSections.has(s.section)) out.push({ level: "error", code: "missing_section", objects: [s.id], params: { label: s.label } });
  }

  // Không được chạy solver với tải hoặc load case tham chiếu tới ID đã xoá/đổi.
  const frames = new Set(model.frames.map((x) => x.id));
  const shells = new Set(model.shells.map((x) => x.id));
  for (const load of model.frameLoads) {
    if (!frames.has(load.frame))
      out.push({ level: "error", code: "missing_load_target", objects: [load.id], params: { name: load.id } });
    if (!patterns.has(load.pattern))
      out.push({ level: "error", code: "missing_load_pattern", objects: [load.id], params: { name: load.id } });
    if (load.kind === "point" && (load.at === undefined || load.at < 0 || load.at > 1))
      out.push({ level: "error", code: "missing_load_target", objects: [load.id], params: { name: load.id } });
  }
  for (const load of model.shellLoads) {
    if (!shells.has(load.shell))
      out.push({ level: "error", code: "missing_load_target", objects: [load.id], params: { name: load.id } });
    if (!patterns.has(load.pattern))
      out.push({ level: "error", code: "missing_load_pattern", objects: [load.id], params: { name: load.id } });
  }
  for (const lc of model.loadCases) {
    if (lc.loads.some((item) => !patterns.has(item.pattern)))
      out.push({ level: "error", code: "missing_load_pattern", objects: [lc.id], params: { name: lc.name } });
  }
  for (const co of model.combos) {
    if (co.items.some((it) => !cases.has(it.case) && !combos.has(it.case)))
      out.push({ level: "error", code: "missing_load_case", objects: [co.id], params: { name: co.name } });
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclic = new Set<string>();
  const visit = (id: string, trail: string[]) => {
    if (visiting.has(id)) {
      for (const item of trail.slice(trail.indexOf(id))) cyclic.add(item);
      return;
    }
    if (visited.has(id)) return;
    const combo = combos.get(id);
    if (!combo) return;
    visiting.add(id);
    for (const it of combo.items) if (combos.has(it.case)) visit(it.case, [...trail, it.case]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const co of model.combos) visit(co.id, [co.id]);
  for (const id of cyclic) {
    const co = combos.get(id)!;
    out.push({ level: "error", code: "invalid_combo_cycle", objects: [id], params: { name: co.name } });
  }

  // Rigid diaphragm chỉ dùng với nút khung cùng cao độ; slave UX/UY/Rz
  // không được có gối để tránh ràng buộc mâu thuẫn/chuyển phản lực sai.
  const usedDiaphragmJoints = new Set<string>();
  for (const diaphragm of model.diaphragms ?? []) {
    const master = joints.get(diaphragm.master);
    const members = [diaphragm.master, ...diaphragm.slaves];
    const invalid = !master || new Set(members).size !== members.length
      || members.some((id) => {
        const j = joints.get(id);
        return !j || Math.abs(j.z - master.z) > 1e-6 || usedDiaphragmJoints.has(id);
      })
      || diaphragm.slaves.some((id) => {
        const r = joints.get(id)?.restraint;
        return r && (r[0] || r[1] || r[5]);
      });
    if (invalid) out.push({ level: "error", code: "invalid_diaphragm", objects: [diaphragm.id], params: { name: diaphragm.name } });
    members.forEach((id) => usedDiaphragmJoints.add(id));
  }

  const seen = new Map<string, string>();
  for (const j of model.joints) {
    const key = `${j.x.toFixed(4)},${j.y.toFixed(4)},${j.z.toFixed(4)}`;
    const prev = seen.get(key);
    if (prev) out.push({ level: "warning", code: "duplicate_joint", objects: [prev, j.id], params: { label: j.label } });
    else seen.set(key, j.id);
  }

  if (model.joints.length > 0 && !model.joints.some((j) => j.restraint?.some(Boolean))) {
    out.push({ level: "error", code: "no_supports", objects: [] });
  }

  const usedSections = new Set([...model.frames.map((f) => f.section), ...model.shells.map((s) => s.section)]);
  for (const s of [...model.frameSections, ...model.shellSections]) {
    if (!usedSections.has(s.id)) out.push({ level: "info", code: "unused_section", objects: [s.id], params: { name: s.name } });
  }
  return out;
}
