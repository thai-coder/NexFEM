// Quy tắc phiên bản X.Y.Z của NexFEM (chủ dự án chốt 14/11/2026, xem docs/versioning.md):
//   X = năm − 2026
//   Y = số tháng đếm liên tục từ tháng 10/2026 (11/2026 → 1, 12/2026 → 2, 01/2027 → 3), không quay về khi sang năm
//   Z = số lần chạy CI (github.run_number), tăng mãi, không đặt lại
// Giới hạn của MSI: X ≤ 255, Y ≤ 255, Z ≤ 65535.

export const Z_WARN = 60000;

/** Phiên bản cho một lần build tại thời điểm `date` (tính theo UTC). Ném lỗi khi ngoài phạm vi quy tắc hoặc giới hạn MSI. */
export function versionFor(date, build) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error("Ngày build không hợp lệ");
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const x = year - 2026;
  const y = 12 * (year - 2026) + month - 10;
  if (x < 0 || y < 1) throw new Error(`Quy tắc phiên bản bắt đầu từ 11/2026 (nhận ${month}/${year})`);
  if (x > 255 || y > 255) throw new Error(`X = ${x}, Y = ${y} vượt giới hạn 255 của MSI`);
  if (!Number.isInteger(build) || build < 0 || build > 65535) throw new Error(`Số build Z phải là số nguyên 0–65535 (nhận ${build})`);
  return `${x}.${y}.${build}`;
}
