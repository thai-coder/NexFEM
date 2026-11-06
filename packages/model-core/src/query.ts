import type { Frame, Joint, Model } from "./schema.ts";

export function jointMap(model: Model): Map<string, Joint> {
  return new Map(model.joints.map((j) => [j.id, j]));
}

export function frameLength(frame: Frame, joints: Map<string, Joint>): number {
  const a = joints.get(frame.i);
  const b = joints.get(frame.j);
  if (!a || !b) return NaN;
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

export function modelBounds(model: Model): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const add = (x: number, y: number, z: number) => {
    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], y);
    min[2] = Math.min(min[2], z);
    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], y);
    max[2] = Math.max(max[2], z);
  };
  for (const j of model.joints) add(j.x, j.y, j.z);
  for (const g of model.grids) {
    for (const x of g.x) for (const y of g.y) add(x.coord, y.coord, 0);
  }
  for (const s of model.stories) add(min[0] === Infinity ? 0 : min[0], min[1] === Infinity ? 0 : min[1], s.elevation);
  if (min[0] === Infinity) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

export interface ModelSummary {
  name: string;
  stories: number;
  joints: number;
  frames: number;
  beams: number;
  columns: number;
  braces: number;
  shells: number;
  materials: number;
  frameSections: number;
  shellSections: number;
  loadPatterns: number;
  loadCases: number;
  combos: number;
}

export function modelSummary(model: Model): ModelSummary {
  const count = (k: Frame["kind"]) => model.frames.filter((f) => f.kind === k).length;
  return {
    name: model.name,
    stories: model.stories.filter((s) => s.height > 0).length,
    joints: model.joints.length,
    frames: model.frames.length,
    beams: count("beam"),
    columns: count("column"),
    braces: count("brace"),
    shells: model.shells.length,
    materials: model.materials.length,
    frameSections: model.frameSections.length,
    shellSections: model.shellSections.length,
    loadPatterns: model.loadPatterns.length,
    loadCases: model.loadCases.length,
    combos: model.combos.length,
  };
}

/** Tìm đối tượng theo id trong mọi bộ sưu tập. */
export function findObject(model: Model, id: string): { collection: keyof Model; object: { id: string } } | undefined {
  for (const key of Object.keys(model) as (keyof Model)[]) {
    const value = model[key];
    if (!Array.isArray(value)) continue;
    const object = (value as { id: string }[]).find((o) => o.id === id);
    if (object) return { collection: key, object };
  }
  return undefined;
}

/** Sinh nhãn số tiếp theo cho tiền tố cho trước, ví dụ "B" → "B13". */
export function nextLabel(labels: Iterable<string>, prefix: string): string {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const l of labels) {
    const m = re.exec(l);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}
