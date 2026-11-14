import type { Frame, Joint } from "@nexfem/model-core";

/**
 * Tìm chỗ đặt tải tập trung theo toạ độ cho điểm CSI không phải đầu thanh/sàn nào đã nhập.
 * ETABS/SAP2000 tự chia thanh tại điểm nằm trên thanh (auto mesh), nên tải ở điểm đó truyền vào thanh.
 * - Trùng một nút đã có (trong dung sai): đặt tải lên nút đó.
 * - Nằm trong đoạn một thanh: trả về thanh và vị trí tương đối; lực tại đó tương đương chính xác với tải tập trung trên thanh.
 */
export function locatePoint(
  p: { x: number; y: number; z: number },
  joints: readonly Joint[],
  frames: readonly Frame[],
  tol: number,
): { joint: Joint } | { frame: Frame; at: number } | null {
  const used = new Set(frames.flatMap((f) => [f.i, f.j]));
  for (const j of joints) if (used.has(j.id) && Math.hypot(j.x - p.x, j.y - p.y, j.z - p.z) <= tol) return { joint: j };
  const byId = new Map(joints.map((j) => [j.id, j]));
  let best: { frame: Frame; at: number; dist: number } | null = null;
  for (const f of frames) {
    const a = byId.get(f.i);
    const b = byId.get(f.j);
    if (!a || !b) continue;
    const d = [b.x - a.x, b.y - a.y, b.z - a.z];
    const len2 = d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2;
    if (!(len2 > 0)) continue;
    const t = ((p.x - a.x) * d[0]! + (p.y - a.y) * d[1]! + (p.z - a.z) * d[2]!) / len2;
    if (t <= 0 || t >= 1) continue;
    const dist = Math.hypot(a.x + t * d[0]! - p.x, a.y + t * d[1]! - p.y, a.z + t * d[2]! - p.z);
    if (dist <= tol && (!best || dist < best.dist)) best = { frame: f, at: t, dist };
  }
  return best ? { frame: best.frame, at: Number(best.at.toPrecision(12)) } : null;
}
