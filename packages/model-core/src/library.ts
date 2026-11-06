import type { Material } from "./schema.ts";

/**
 * Thư viện vật liệu mẫu (đơn vị nội bộ kN, m).
 *
 * Giá trị lấy theo các bảng thông dụng của TCVN 5574:2018 (bê tông, cốt thép) và EN 1993-1-1 (thép kết cấu).
 * Cần đối chiếu với bản tiêu chuẩn chính thức trước khi dùng cho thiết kế.
 */
const MPa = 1000; // kN/m²

const concrete = (grade: string, E: number, Rb: number): Material => ({
  id: `mat-${grade.toLowerCase()}`,
  name: grade,
  type: "concrete",
  E: E * MPa,
  nu: 0.2,
  gamma: 25,
  strength: Rb * MPa,
  code: "TCVN 5574:2018",
});

const rebar = (grade: string, Rs: number): Material => ({
  id: `mat-${grade.toLowerCase()}`,
  name: grade,
  type: "rebar",
  E: 200000 * MPa,
  nu: 0.3,
  gamma: 78.5,
  strength: Rs * MPa,
  code: "TCVN 5574:2018",
});

const steel = (grade: string, fy: number): Material => ({
  id: `mat-${grade.toLowerCase()}`,
  name: grade,
  type: "steel",
  E: 210000 * MPa,
  nu: 0.3,
  gamma: 78.5,
  strength: fy * MPa,
  code: "EN 1993-1-1",
});

/** Bê tông: E_b và R_b (MPa). Thép: R_s hoặc f_y (MPa). */
export const MATERIAL_LIBRARY: Material[] = [
  concrete("B15", 24000, 8.5),
  concrete("B20", 27500, 11.5),
  concrete("B25", 30000, 14.5),
  concrete("B30", 32500, 17.0),
  concrete("B35", 34500, 19.5),
  concrete("B40", 36000, 22.0),
  concrete("B45", 37000, 25.0),
  concrete("B50", 38000, 27.5),
  concrete("B55", 39000, 30.0),
  concrete("B60", 39500, 33.0),
  rebar("CB300-V", 260),
  rebar("CB400-V", 350),
  rebar("CB500-V", 435),
  steel("S235", 235),
  steel("S275", 275),
  steel("S355", 355),
  steel("S460", 460),
];
