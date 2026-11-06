import { frameLength, jointMap } from "./query.ts";
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
    | "unused_section";
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

  for (const s of [...model.frameSections, ...model.shellSections]) {
    if (!materials.has(s.material)) out.push({ level: "error", code: "missing_material", objects: [s.id], params: { name: s.name } });
  }

  const pairs = new Map<string, string>();
  for (const f of model.frames) {
    if (!joints.has(f.i) || !joints.has(f.j)) {
      out.push({ level: "error", code: "missing_joint", objects: [f.id], params: { label: f.label } });
      continue;
    }
    if (!frameSections.has(f.section)) out.push({ level: "error", code: "missing_section", objects: [f.id], params: { label: f.label } });
    if (frameLength(f, joints) < 1e-6) out.push({ level: "error", code: "zero_length", objects: [f.id], params: { label: f.label } });
    const key = [f.i, f.j].sort().join("|");
    const prev = pairs.get(key);
    if (prev) out.push({ level: "warning", code: "duplicate_frame", objects: [prev, f.id], params: { label: f.label } });
    else pairs.set(key, f.id);
  }

  for (const s of model.shells) {
    if (s.joints.some((j) => !joints.has(j))) out.push({ level: "error", code: "missing_joint", objects: [s.id], params: { label: s.label } });
    if (!shellSections.has(s.section)) out.push({ level: "error", code: "missing_section", objects: [s.id], params: { label: s.label } });
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
