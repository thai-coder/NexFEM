import { jointMap, type Model } from "@nexfem/model-core";
import { Box3, Vector3 } from "three";
import type { VisibleSet } from "./filter.ts";

export type MomentComponent = "m2" | "m3";
type MomentSamples = { x: readonly number[] } & Partial<Record<MomentComponent, readonly number[]>>;
type MomentMember = { x: readonly number[]; values: readonly number[]; origin: Vector3; axis1: Vector3; direction: Vector3 };

export interface MomentDiagram {
  members: ReadonlyMap<string, MomentMember>;
  /** Mét của tung độ biểu đồ trên mỗi kN·m. */
  scale: number;
}

export function buildMomentDiagram(
  model: Model,
  forces: Readonly<Record<string, MomentSamples>>,
  manualScale: number | null,
  component: MomentComponent = "m3",
): MomentDiagram | null {
  const joints = jointMap(model);
  const bounds = new Box3();
  const members = new Map<string, MomentMember>();
  let peak = 0;
  for (const frame of model.frames) {
    const i = joints.get(frame.i);
    const j = joints.get(frame.j);
    const result = Object.hasOwn(forces, frame.id) ? forces[frame.id] : undefined;
    const values = result?.[component];
    if (!i || !j || !result || !values || result.x.length < 2 || result.x.length !== values.length) continue;

    const origin = new Vector3(i.x, i.y, i.z);
    const end = new Vector3(j.x, j.y, j.z);
    const axis1 = end.clone().sub(origin);
    const length = axis1.length();
    if (!(length > 0) || !Number.isFinite(length)) continue;
    const tolerance = 1e-9 * Math.max(1, length);
    if (result.x.some((x, k) => !Number.isFinite(x) || x < -tolerance || x > length + tolerance || (k > 0 && x < result.x[k - 1]!))) continue;
    if (values.some((value) => !Number.isFinite(value))) continue;

    axis1.divideScalar(length);
    // Cùng trục 2 và ngưỡng thanh đứng với fem-solver/src/element.rs::local_axes.
    const axis2 = Math.abs(axis1.z) > 1 - 1e-6
      ? new Vector3(1, 0, 0)
      : new Vector3(0, 0, 1).addScaledVector(axis1, -axis1.z).normalize();
    // Góc xoay trục địa phương (độ): e2' = cos·e2 + sin·e3, như local_axes của fem-solver.
    if (frame.angle) {
      const a = (frame.angle * Math.PI) / 180;
      const axis3 = new Vector3().crossVectors(axis1, axis2);
      axis2.multiplyScalar(Math.cos(a)).addScaledVector(axis3, Math.sin(a));
    }
    // Phía chịu kéo: M2 dương về +3 (e1 × e2), M3 dương về −2.
    const direction = component === "m2" ? new Vector3().crossVectors(axis1, axis2) : axis2.negate();
    members.set(frame.id, { origin, axis1, direction, x: result.x, values });
    bounds.expandByPoint(origin).expandByPoint(end);
    for (const value of values) peak = Math.max(peak, Math.abs(value));
  }
  if (peak === 0) return null;
  const scale = manualScale ?? (0.06 * bounds.getSize(new Vector3()).length()) / peak;
  return Number.isFinite(scale) && scale > 0 ? { members, scale } : null;
}

/** Nối các station của solver, chiếu tung độ biểu đồ lên mặt phẳng của ô 2D. */
export function momentDiagramPositions(diagram: MomentDiagram, visible: VisibleSet): Float32Array | null {
  const plane = visible.plane;
  const normal = plane ? { x: 0, y: 1, z: 2 }[plane.axis] : undefined;
  const output: number[] = [];
  const base = new Vector3(), point = new Vector3(), previous = new Vector3(), direction = new Vector3();
  const segment = (a: Vector3, b: Vector3) => output.push(a.x, a.y, a.z, b.x, b.y, b.z);
  for (const { id } of visible.frames) {
    const member = diagram.members.get(id);
    if (!member || member.values.every((value) => value === 0)) continue;
    direction.copy(member.direction);
    if (normal !== undefined) direction.setComponent(normal, 0);
    if (direction.lengthSq() < 1e-12) continue;

    for (let k = 0; k < member.x.length; k++) {
      base.copy(member.origin).addScaledVector(member.axis1, member.x[k]!);
      if (plane && normal !== undefined) base.setComponent(normal, plane.value);
      point.copy(base).addScaledVector(direction, diagram.scale * member.values[k]!);
      if (k > 0) segment(previous, point);
      if (k === 0 || k === member.x.length - 1) segment(base, point);
      previous.copy(point);
    }
  }
  const positions = Float32Array.from(output);
  return positions.length && positions.every(Number.isFinite) ? positions : null;
}
