import type { Model } from "@nexfem/model-core";
import { TOL, type VisibleSet } from "./filter.ts";

export type P3 = [number, number, number];
export type SnapKind = "joint" | "grid" | "mid" | "gridline" | "free";

export interface SnapModes {
  /** Nút / đầu mút thanh. */
  joint: boolean;
  /** Giao điểm lưới trục (và giao trục với cao độ tầng ở mặt đứng). */
  grid: boolean;
  /** Trung điểm thanh. */
  mid: boolean;
  /** Điểm trên trục lưới gần nhất. */
  gridline: boolean;
}

export const ALL_SNAPS: SnapModes = { joint: true, grid: true, mid: true, gridline: true };

export interface SnapPoint {
  kind: SnapKind;
  p: P3;
  /** Mô tả ngắn, ví dụ "A-2", "B12". */
  label?: string;
}

const PRIORITY: Record<SnapKind, number> = { joint: 0, grid: 1, mid: 2, gridline: 3, free: 4 };

/** Các điểm bắt được (toạ độ thế giới) trên mặt phẳng của khung nhìn 2D. */
export function snapPoints(model: Model, vis: VisibleSet, modes: SnapModes): SnapPoint[] {
  const plane = vis.plane;
  if (!plane) return [];
  const out: SnapPoint[] = [];
  const joints = new Map(model.joints.map((j) => [j.id, j]));
  if (modes.joint) for (const j of vis.joints) out.push({ kind: "joint", p: [j.x, j.y, j.z], label: j.label });
  if (modes.grid) {
    for (const g of model.grids) {
      if (plane.axis === "z") {
        for (const x of g.x) for (const y of g.y) out.push({ kind: "grid", p: [x.coord, y.coord, plane.value], label: `${x.label}-${y.label}` });
      } else {
        const lines = plane.axis === "x" ? g.y : g.x;
        for (const l of lines) {
          for (const s of model.stories) {
            const p: P3 = plane.axis === "x" ? [plane.value, l.coord, s.elevation] : [l.coord, plane.value, s.elevation];
            out.push({ kind: "grid", p, label: `${l.label} · ${s.name}` });
          }
        }
      }
    }
  }
  if (modes.mid) {
    for (const f of vis.frames) {
      const a = joints.get(f.i);
      const b = joints.get(f.j);
      if (a && b) out.push({ kind: "mid", p: [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2], label: f.label });
    }
  }
  return out;
}

export interface GridHit {
  kind: "x" | "y" | "story";
  id: string;
  label: string;
}

/** Các trục lưới (đường thẳng) trên mặt phẳng: điểm gốc + phương + nhận dạng để sửa. */
export function gridLines(model: Model, vis: VisibleSet): ({ o: P3; d: P3; label: string } & GridHit)[] {
  const plane = vis.plane;
  if (!plane) return [];
  const out: ({ o: P3; d: P3; label: string } & GridHit)[] = [];
  for (const g of model.grids) {
    if (plane.axis === "z") {
      for (const x of g.x) out.push({ o: [x.coord, 0, plane.value], d: [0, 1, 0], label: x.label, kind: "x", id: x.id });
      for (const y of g.y) out.push({ o: [0, y.coord, plane.value], d: [1, 0, 0], label: y.label, kind: "y", id: y.id });
    } else {
      const lines = plane.axis === "x" ? g.y : g.x;
      for (const l of lines) {
        out.push({ o: plane.axis === "x" ? [plane.value, l.coord, 0] : [l.coord, plane.value, 0], d: [0, 0, 1], label: l.label, kind: plane.axis === "x" ? "y" : "x", id: l.id });
      }
      for (const s of model.stories) {
        out.push({ o: plane.axis === "x" ? [plane.value, 0, s.elevation] : [0, plane.value, s.elevation], d: plane.axis === "x" ? [0, 1, 0] : [1, 0, 0], label: s.name, kind: "story", id: s.id });
      }
    }
  }
  return out;
}

/**
 * Chọn điểm bắt tốt nhất quanh con trỏ.
 * @param cursor toạ độ con trỏ trên mặt phẳng (thế giới)
 * @param toScreen chiếu điểm thế giới ra pixel
 * @param radius bán kính bắt điểm (px)
 * @param worldPerPixel tỉ lệ để đổi bán kính sang mét cho bắt trên trục
 */
export function pickSnap(
  cursor: P3,
  cursorPx: [number, number],
  points: SnapPoint[],
  lines: { o: P3; d: P3; label: string }[],
  modes: SnapModes,
  toScreen: (p: P3) => [number, number],
  radius: number,
  worldPerPixel: number,
): SnapPoint {
  let best: SnapPoint | null = null;
  let bestScore = Infinity;
  for (const c of points) {
    const s = toScreen(c.p);
    const dist = Math.hypot(s[0] - cursorPx[0], s[1] - cursorPx[1]);
    if (dist > radius) continue;
    const score = PRIORITY[c.kind] * 1000 + dist;
    if (score < bestScore) {
      best = c;
      bestScore = score;
    }
  }
  if (best) return best;
  if (modes.gridline) {
    let bestD = radius * worldPerPixel;
    let hit: SnapPoint | null = null;
    for (const l of lines) {
      const v: P3 = [cursor[0] - l.o[0], cursor[1] - l.o[1], cursor[2] - l.o[2]];
      const t = v[0] * l.d[0] + v[1] * l.d[1] + v[2] * l.d[2];
      const p: P3 = [l.o[0] + l.d[0] * t, l.o[1] + l.d[1] * t, l.o[2] + l.d[2] * t];
      const dd = Math.hypot(cursor[0] - p[0], cursor[1] - p[1], cursor[2] - p[2]);
      if (dd <= bestD) {
        bestD = dd;
        hit = { kind: "gridline", p, label: l.label };
      }
    }
    if (hit) return hit;
  }
  return { kind: "free", p: cursor };
}

/** Khoá phương (giữ Shift): giữ thành phần lệch nhiều nhất so với điểm neo, trên mặt phẳng vẽ. */
export function orthoLock(anchor: P3, p: P3, plane: "x" | "y" | "z"): P3 {
  const [i, j] = plane === "z" ? ([0, 1] as const) : plane === "x" ? ([1, 2] as const) : ([0, 2] as const);
  const out: P3 = [p[0], p[1], p[2]];
  if (Math.abs(p[i] - anchor[i]) >= Math.abs(p[j] - anchor[j])) out[j] = anchor[j];
  else out[i] = anchor[i];
  return out;
}

export { TOL };
