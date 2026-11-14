import type { VisibleSet } from "./filter.ts";

/**
 * Tuỳ chọn hiển thị của một khung nhìn (Set View Options).
 * Đối tượng bị ẩn không được vẽ, không chọn được và không bắt điểm được trong khung nhìn đó.
 */
export interface DisplayOptions {
  // Đối tượng
  joints: boolean;
  beams: boolean;
  columns: boolean;
  braces: boolean;
  slabs: boolean;
  walls: boolean;
  // Nhãn
  jointLabels: boolean;
  frameLabels: boolean;
  /** Tên tiết diện của thanh, đặt ở giữa thanh. */
  sectionNames: boolean;
  shellLabels: boolean;
  // Gán
  /** Ký hiệu gối. */
  restraints: boolean;
  /** Vòng tròn nhả liên kết ở đầu thanh. */
  releases: boolean;
  /** Tải của mẫu tải đang chọn hiển thị. */
  loads: boolean;
  // Khác
  grid: boolean;
  /** Tô màu mặt sàn/vách (tắt thì chỉ còn đường viền). */
  fillShells: boolean;
}

export const DEFAULT_DISPLAY: DisplayOptions = {
  joints: true,
  beams: true,
  columns: true,
  braces: true,
  slabs: true,
  walls: true,
  jointLabels: false,
  frameLabels: false,
  sectionNames: false,
  shellLabels: false,
  restraints: true,
  releases: true,
  loads: true,
  grid: true,
  fillShells: true,
};

/** Bổ sung giá trị mặc định cho các khoá thiếu (dữ liệu lưu từ phiên bản cũ chỉ có 4 khoá). */
export function normalizeDisplay(d: Partial<DisplayOptions> | null | undefined): DisplayOptions {
  const out = { ...DEFAULT_DISPLAY };
  if (!d) return out;
  for (const k of Object.keys(DEFAULT_DISPLAY) as (keyof DisplayOptions)[]) {
    if (typeof d[k] === "boolean") out[k] = d[k];
  }
  // Phiên bản cũ: "restraints" điều khiển cả nhả liên kết.
  if (typeof d.releases !== "boolean" && typeof d.restraints === "boolean") out.releases = d.restraints;
  return out;
}

/** Bỏ các đối tượng bị ẩn theo loại khỏi tập đối tượng của khung nhìn. */
export function applyDisplayFilter(vis: VisibleSet, d: DisplayOptions): VisibleSet {
  const frameOn = (k: string) => (k === "column" ? d.columns : k === "beam" ? d.beams : d.braces);
  const all = d.beams && d.columns && d.braces && d.slabs && d.walls;
  if (all) return vis;
  return {
    ...vis,
    frames: vis.frames.filter((f) => frameOn(f.kind)),
    columnMarks: d.columns ? vis.columnMarks : [],
    shells: vis.shells.filter((s) => (s.kind === "wall" ? d.walls : d.slabs)),
  };
}
