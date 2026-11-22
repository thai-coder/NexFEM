import type { FrameLoad } from "./schema.ts";

/**
 * Phần của tải thanh `load` nằm trên đoạn [t0, t1] (tương đối theo thanh gốc), viết lại theo toạ độ tương đối của đoạn.
 * Dùng khi chia thanh (lệnh chia thanh, bộ nhập CSI tự chia tại nút) để tải đi theo thanh mà không đổi vị trí hay cường độ
 * (docs/plans/FRAME_LOAD_SEGMENTS_PLAN.md, R1). Trả `null` khi tải không có phần nào trên đoạn.
 *
 * - `distributed`: tải đều cả thanh gốc → tải đều cả đoạn.
 * - `point`: chỉ đoạn chứa điểm đặt nhận tải (điểm đúng tại ranh giới thuộc đoạn đầu tiên chứa nó).
 * - `linear`: cắt [start, end] theo đoạn, nội suy cường độ tại hai mút mới.
 */
export function loadOnSegment(load: FrameLoad, t0: number, t1: number): Omit<FrameLoad, "id" | "frame"> | null {
  const span = t1 - t0;
  if (!(span > 0)) return null;
  const rel = (t: number) => Math.min(1, Math.max(0, (t - t0) / span));
  const { id: _id, frame: _frame, ...rest } = load;
  if (load.kind === "distributed") return rest;
  if (load.kind === "point") {
    const at = load.at ?? 0.5;
    if (at < t0 - 1e-12 || at > t1 + 1e-12) return null;
    return { ...rest, at: rel(at) };
  }
  const s = load.start ?? 0;
  const e = load.end ?? 1;
  const v1 = load.valueEnd ?? load.value;
  const a = Math.max(s, t0);
  const b = Math.min(e, t1);
  if (b - a <= 1e-12) return null;
  const w = (t: number) => load.value + ((v1 - load.value) * (t - s)) / (e - s);
  return { ...rest, start: rel(a), end: rel(b), value: w(a), valueEnd: w(b) };
}
