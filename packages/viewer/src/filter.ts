import type { Frame, Joint, Model, Shell } from "@nexfem/model-core";

/** Loại khung nhìn. */
export type ViewSpec =
  | { kind: "3d" }
  | { kind: "plan"; story: string }
  | { kind: "elevation"; grid: string; line: string };

export const TOL = 1e-4;

export interface VisibleSet {
  frames: Frame[];
  /** Cột cắt qua mặt bằng, vẽ thành ô vuông (chỉ ở Plan). */
  columnMarks: Frame[];
  shells: Shell[];
  joints: Joint[];
  /** Mặt phẳng của khung nhìn 2D, để chiếu toạ độ con trỏ. */
  plane?: { axis: "x" | "y" | "z"; value: number };
}

/** Tìm trục lưới theo id trong mọi hệ lưới, trả về phương và toạ độ. */
export function findGridLine(model: Model, grid: string, line: string): { dir: "x" | "y"; coord: number; label: string } | undefined {
  const g = model.grids.find((x) => x.id === grid);
  if (!g) return undefined;
  const lx = g.x.find((l) => l.id === line);
  if (lx) return { dir: "x", coord: lx.coord, label: lx.label };
  const ly = g.y.find((l) => l.id === line);
  if (ly) return { dir: "y", coord: ly.coord, label: ly.label };
  return undefined;
}

/** Lọc các đối tượng hiện trong một khung nhìn. */
export function visibleObjects(model: Model, view: ViewSpec): VisibleSet {
  const joints = new Map(model.joints.map((j) => [j.id, j]));
  const all = { frames: model.frames, columnMarks: [], shells: model.shells, joints: model.joints };
  if (view.kind === "3d") return all;

  let onPlane: (j: Joint) => boolean;
  let plane: VisibleSet["plane"];
  if (view.kind === "plan") {
    const story = model.stories.find((s) => s.id === view.story);
    if (!story) return { frames: [], columnMarks: [], shells: [], joints: [] };
    const z = story.elevation;
    onPlane = (j) => Math.abs(j.z - z) < TOL;
    plane = { axis: "z", value: z };
  } else {
    const gl = findGridLine(model, view.grid, view.line);
    if (!gl) return { frames: [], columnMarks: [], shells: [], joints: [] };
    // Trục chữ (A, B…) có toạ độ theo X: mặt đứng là mặt phẳng x = const.
    onPlane = gl.dir === "x" ? (j) => Math.abs(j.x - gl.coord) < TOL : (j) => Math.abs(j.y - gl.coord) < TOL;
    plane = { axis: gl.dir, value: gl.coord };
  }

  const inPlane = (ids: string[]) => ids.every((id) => {
    const j = joints.get(id);
    return j ? onPlane(j) : false;
  });

  const frames: Frame[] = [];
  const columnMarks: Frame[] = [];
  for (const f of model.frames) {
    if (inPlane([f.i, f.j])) frames.push(f);
    else if (view.kind === "plan" && f.kind === "column") {
      const top = joints.get(f.j);
      if (top && onPlane(top)) columnMarks.push(f);
    }
  }
  const shells = model.shells.filter((s) => inPlane(s.joints));
  return { frames, columnMarks, shells, joints: model.joints.filter(onPlane), plane };
}

/** Tiêu đề khung nhìn, ví dụ "Plan – Tầng 3", "Elevation – Trục B". */
export function viewTitle(model: Model, view: ViewSpec, t: { plan: string; elevation: string; view3d: string; axis: string }): string {
  if (view.kind === "3d") return t.view3d;
  if (view.kind === "plan") return `${t.plan} – ${model.stories.find((s) => s.id === view.story)?.name ?? "?"}`;
  const gl = findGridLine(model, view.grid, view.line);
  return `${t.elevation} – ${t.axis} ${gl?.label ?? "?"}`;
}

/** Kiểm tra đoạn thẳng có cắt hình chữ nhật (toạ độ màn hình) không — dùng cho chọn crossing. */
export function segmentIntersectsRect(
  a: [number, number],
  b: [number, number],
  r: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  const inside = (p: [number, number]) => p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1;
  if (inside(a) || inside(b)) return true;
  const edges: [[number, number], [number, number]][] = [
    [[r.x0, r.y0], [r.x1, r.y0]],
    [[r.x1, r.y0], [r.x1, r.y1]],
    [[r.x1, r.y1], [r.x0, r.y1]],
    [[r.x0, r.y1], [r.x0, r.y0]],
  ];
  const cross = (o: [number, number], p: [number, number], q: [number, number]) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  for (const [c, d] of edges) {
    const d1 = cross(c, d, a);
    const d2 = cross(c, d, b);
    const d3 = cross(a, b, c);
    const d4 = cross(a, b, d);
    if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  }
  return false;
}
