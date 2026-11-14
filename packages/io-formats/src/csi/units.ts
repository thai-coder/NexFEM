/**
 * Đổi đơn vị CSI sang đơn vị nội bộ của NexFEM (kN, m). Chỉ dùng hệ số định nghĩa chính xác:
 * 1 lbf = 4,4482216152605 N; 1 in = 0,0254 m; 1 ft = 0,3048 m; 1 kgf = 9,80665 N; 1 tonf (tấn lực mét) = 9,80665 kN.
 */
export const FORCE_TO_KN: Record<string, number> = {
  LB: 4.4482216152605e-3,
  KIP: 4.4482216152605,
  N: 1e-3,
  KN: 1,
  KGF: 9.80665e-3,
  TONF: 9.80665,
};

export const LENGTH_TO_M: Record<string, number> = {
  IN: 0.0254,
  FT: 0.3048,
  MM: 1e-3,
  CM: 1e-2,
  M: 1,
};

export interface UnitFactors {
  force: string;
  length: string;
  temperature: string;
  /** Hệ số nhân: lực → kN, chiều dài → m. */
  f: number;
  l: number;
}

/** Nhận diện đơn vị từ bản ghi `UNITS "LB" "IN" "C"`; null nếu không biết. */
export function unitFactors(force: string, length: string, temperature: string): UnitFactors | null {
  const fk = force.toUpperCase();
  const lk = length.toUpperCase();
  const f = FORCE_TO_KN[fk];
  const l = LENGTH_TO_M[lk];
  if (f === undefined || l === undefined) return null;
  return { force: fk, length: lk, temperature: temperature.toUpperCase(), f, l };
}

/** Các đại lượng cần đổi: chiều dài, lực, ứng suất (lực/dài²), trọng lượng riêng (lực/dài³), tải phân bố (lực/dài), tải diện tích (lực/dài²). */
export const conv = {
  length: (u: UnitFactors, v: number) => v * u.l,
  force: (u: UnitFactors, v: number) => v * u.f,
  stress: (u: UnitFactors, v: number) => (v * u.f) / (u.l * u.l),
  unitWeight: (u: UnitFactors, v: number) => (v * u.f) / u.l ** 3,
  forcePerLength: (u: UnitFactors, v: number) => (v * u.f) / u.l,
};
