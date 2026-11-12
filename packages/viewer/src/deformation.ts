import type { Joint, Model } from "@nexfem/model-core";
import { Box3, Vector3 } from "three";
import type { VisibleSet } from "./filter.ts";

export interface DeformedFrames {
  positions: Float32Array;
  frameOffsets: ReadonlyMap<string, number>;
  scale: number;
}

/** Các đoạn thẳng nối hai nút đã dịch chuyển, dùng Ux/Uy/Uz tổng thể (m). */
export function buildDeformedFrames(
  model: Model,
  displacements: Readonly<Record<string, readonly number[]>>,
  requestedScale: number | null,
): DeformedFrames | null {
  type End = { joint: Joint; ux: number; uy: number; uz: number };
  const ends = new Map<string, End>();
  for (const joint of model.joints) {
    if (!Object.hasOwn(displacements, joint.id)) continue;
    const [ux, uy, uz] = displacements[joint.id]!;
    if (ux === undefined || uy === undefined || uz === undefined || ![ux, uy, uz].every(Number.isFinite)) continue;
    ends.set(joint.id, { joint, ux, uy, uz });
  }

  const segments: [End, End][] = [];
  const frameOffsets = new Map<string, number>();
  const bounds = new Box3();
  const point = new Vector3();
  let maxDisplacement = 0;
  for (const frame of model.frames) {
    const a = ends.get(frame.i);
    const b = ends.get(frame.j);
    if (!a || !b) continue;
    frameOffsets.set(frame.id, segments.length * 6);
    segments.push([a, b]);
    if (requestedScale === null) {
      for (const { joint, ux, uy, uz } of [a, b]) {
        bounds.expandByPoint(point.set(joint.x, joint.y, joint.z));
        maxDisplacement = Math.max(maxDisplacement, Math.hypot(ux, uy, uz));
      }
    }
  }
  if (!segments.length) return null;

  // Auto: chuyển vị lớn nhất xấp xỉ 8% đường chéo của khung thanh.
  const autoScale = requestedScale === null && maxDisplacement > 0
    ? (0.08 * bounds.getSize(point).length()) / maxDisplacement
    : 1;
  const scale = requestedScale ?? (Number.isFinite(autoScale) && autoScale > 0 ? Number(autoScale.toPrecision(4)) : 1);
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const positions = new Float32Array(segments.length * 6);
  let offset = 0;
  for (const segment of segments) {
    for (const { joint, ux, uy, uz } of segment) {
      const x = Math.fround(joint.x + scale * ux);
      const y = Math.fround(joint.y + scale * uy);
      const z = Math.fround(joint.z + scale * uz);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
      positions[offset++] = x;
      positions[offset++] = y;
      positions[offset++] = z;
    }
  }
  return { positions, frameOffsets, scale };
}

/** Lọc theo thanh thuộc mặt phẳng gốc, rồi chiếu hai đầu đã dịch chuyển lên mặt phẳng đó. */
export function projectDeformedFrames(shape: DeformedFrames, visible: VisibleSet): Float32Array | null {
  const { plane } = visible;
  if (!plane || !visible.frames.length) return null;
  const normal = { x: 0, y: 1, z: 2 }[plane.axis];
  const positions = new Float32Array(visible.frames.length * 6);
  let offset = 0;
  for (const { id } of visible.frames) {
    const start = shape.frameOffsets.get(id);
    if (start === undefined) continue;
    positions.set(shape.positions.subarray(start, start + 6), offset);
    positions[offset + normal] = plane.value;
    positions[offset + 3 + normal] = plane.value;
    offset += 6;
  }
  return offset ? positions.subarray(0, offset) : null;
}
