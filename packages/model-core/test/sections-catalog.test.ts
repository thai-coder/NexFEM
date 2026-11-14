import { describe, expect, it } from "vitest";
import { checkModel, iSection, sampleModel, sectionProperties } from "../src/index.ts";

/**
 * Đối chiếu đặc trưng tiết diện thép cán với bảng EN 10365:2017 (giá trị catalogue, cm).
 * Kích thước mm: h, b, tw, tf, r. Đặc trưng: A (cm²), Iy (cm⁴, trục mạnh = I33), Iz (cm⁴ = I22), It (cm⁴ = J).
 */
const CATALOG = [
  { name: "IPE 200", h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12, A: 28.48, Iy: 1943, Iz: 142.4, It: 6.98 },
  { name: "IPE 300", h: 300, b: 150, tw: 7.1, tf: 10.7, r: 15, A: 53.81, Iy: 8356, Iz: 603.8, It: 20.12 },
  { name: "HEA 200", h: 190, b: 200, tw: 6.5, tf: 10, r: 18, A: 53.83, Iy: 3692, Iz: 1336, It: 20.98 },
  { name: "HEB 300", h: 300, b: 300, tw: 11, tf: 19, r: 27, A: 149.1, Iy: 25170, Iz: 8563, It: 185.0 },
];

const rel = (got: number, want: number) => Math.abs(got - want) / want;

describe("tiết diện chữ I thép cán so với bảng EN 10365", () => {
  for (const c of CATALOG) {
    it(`${c.name}: A, I33, I22 lệch ≤ 0,1 %, J lệch ≤ 2,5 %`, () => {
      const p = sectionProperties({ shape: "I", h: c.h / 1000, bf: c.b / 1000, tw: c.tw / 1000, tf: c.tf / 1000, r: c.r / 1000 });
      expect(rel(p.A * 1e4, c.A)).toBeLessThan(0.001);
      expect(rel(p.I33 * 1e8, c.Iy)).toBeLessThan(0.001);
      expect(rel(p.I22 * 1e8, c.Iz)).toBeLessThan(0.001);
      expect(rel(p.J * 1e8, c.It)).toBeLessThan(0.025);
    });
  }

  it("bỏ qua bán kính lượn làm A và I33 thấp hơn bảng 3,5–5,5 %, J thấp hơn 19–30 % (lý do phải nhập r)", () => {
    for (const c of CATALOG) {
      const p = iSection(c.h / 1000, c.b / 1000, c.tf / 1000, c.tw / 1000, 0);
      expect(rel(p.A * 1e4, c.A)).toBeGreaterThan(0.035);
      expect(rel(p.I33 * 1e8, c.Iy)).toBeGreaterThan(0.035);
      expect(rel(p.J * 1e8, c.It)).toBeGreaterThan(0.19);
    }
  });

  it("r = 0 cho đúng kết quả cũ (mô hình đã lưu không đổi)", () => {
    const a = sectionProperties({ shape: "I", h: 0.3, bf: 0.15, tf: 0.01, tw: 0.006 });
    const b = sectionProperties({ shape: "I", h: 0.3, bf: 0.15, tf: 0.01, tw: 0.006, r: 0 });
    expect(b).toEqual(a);
    expect(a.A).toBeCloseTo(2 * 0.15 * 0.01 + 0.28 * 0.006, 12);
  });

  it("góc lượn quá lớn so với cánh/bụng bị báo lỗi tiết diện", () => {
    const m = sampleModel();
    m.frameSections[0]!.geometry = { shape: "I", h: 0.3, bf: 0.15, tf: 0.0107, tw: 0.0071, r: 0.08 };
    expect(checkModel(m).some((i) => i.code === "invalid_section")).toBe(true);
    m.frameSections[0]!.geometry = { shape: "I", h: 0.3, bf: 0.15, tf: 0.0107, tw: 0.0071, r: 0.015 };
    expect(checkModel(m).some((i) => i.code === "invalid_section")).toBe(false);
  });
});

describe("độ chính xác các hình khác", () => {
  it("chữ nhật: J theo Roark sai ≤ 0,2 % so với lời giải chuỗi chính xác", () => {
    // β chính xác (Timoshenko): b/h = 1 → 0,1406; 2 → 0,229; 4 → 0,281; 10 → 0,312 (J = β·a·c³, a ≥ c).
    for (const [ratio, beta] of [[1, 0.1406], [2, 0.229], [4, 0.281], [10, 0.312]] as const) {
      const p = sectionProperties({ shape: "rect", b: 0.1, h: 0.1 * ratio });
      expect(rel(p.J, beta * 0.1 * ratio * 0.1 ** 3)).toBeLessThan(0.003);
    }
  });
});
