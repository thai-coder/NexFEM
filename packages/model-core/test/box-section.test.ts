import { describe, expect, it } from "vitest";
import { boxSection, checkModel, sampleModel, sectionProperties } from "../src/index.ts";

/** Đa giác xấp xỉ hình chữ nhật bo góc (độc lập với công thức giải tích): N điểm trên mỗi cung. */
function roundedRectPolygon(b: number, h: number, r: number, n = 4000, hole = false): [number, number][] {
  const pts: [number, number][] = [];
  const corners: [number, number, number][] = [
    [b / 2 - r, h / 2 - r, 0],
    [-b / 2 + r, h / 2 - r, Math.PI / 2],
    [-b / 2 + r, -h / 2 + r, Math.PI],
    [b / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of corners) {
    if (r <= 0) pts.push([cx, cy]);
    else for (let i = 0; i <= n; i++) pts.push([cx + r * Math.cos(a0 + ((Math.PI / 2) * i) / n), cy + r * Math.sin(a0 + ((Math.PI / 2) * i) / n)]);
  }
  return hole ? pts.reverse() : pts;
}

/** Diện tích và mô men quán tính của đa giác (công thức shoelace), quanh gốc toạ độ = trọng tâm đối xứng. */
function polygonProps(rings: [number, number][][]) {
  let A = 0;
  let Ixx = 0;
  let Iyy = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i]!;
      const [x1, y1] = ring[(i + 1) % ring.length]!;
      const c = x0 * y1 - x1 * y0;
      A += c / 2;
      Ixx += (c * (y0 * y0 + y0 * y1 + y1 * y1)) / 12;
      Iyy += (c * (x0 * x0 + x0 * x1 + x1 * x1)) / 12;
    }
  }
  return { A, Ixx, Iyy };
}

const rel = (got: number, want: number) => Math.abs(got - want) / Math.abs(want);

describe("ống hộp có bán kính góc", () => {
  const cases: [string, number, number, number, number][] = [
    ["SHS 200x200x10, r = 2t", 0.2, 0.2, 0.01, 0.02],
    ["RHS 300x150x8, r = 2t", 0.3, 0.15, 0.008, 0.016],
    ["RHS 120x60x4, r = 1,5t", 0.12, 0.06, 0.004, 0.006],
    ["góc ngoài nhỏ hơn bề dày (góc trong vuông)", 0.2, 0.1, 0.01, 0.006],
  ];
  for (const [name, h, b, t, r] of cases) {
    it(`${name}: A, I33, I22 khớp tích phân đa giác (≤ 0,001 %)`, () => {
      const outer = polygonProps([roundedRectPolygon(b, h, r)]);
      const inner = polygonProps([roundedRectPolygon(b - 2 * t, h - 2 * t, Math.max(r - t, 0), 4000, true)]);
      const A = outer.A + inner.A;
      const p = boxSection(h, b, t, r);
      expect(rel(p.A, A)).toBeLessThan(1e-5);
      // Trục mạnh I33 quanh trục ngang (theo chiều cao h) ứng với Ixx của đa giác.
      expect(rel(p.I33, outer.Ixx + inner.Ixx)).toBeLessThan(1e-5);
      expect(rel(p.I22, outer.Iyy + inner.Iyy)).toBeLessThan(1e-5);
    });
  }

  it("r = 0 cho đúng kết quả cũ; r > 0 làm giảm A và I so với góc vuông", () => {
    const a = sectionProperties({ shape: "box", h: 0.2, b: 0.2, t: 0.01 });
    expect(sectionProperties({ shape: "box", h: 0.2, b: 0.2, t: 0.01, r: 0 })).toEqual(a);
    expect(a.A).toBeCloseTo(0.2 * 0.2 - 0.18 * 0.18, 12);
    const rounded = sectionProperties({ shape: "box", h: 0.2, b: 0.2, t: 0.01, r: 0.02 });
    expect(rounded.A).toBeLessThan(a.A);
    expect(rounded.I33).toBeLessThan(a.I33);
    expect(rounded.J).toBeGreaterThan(0);
    // Hộp vuông: hai trục cho cùng kết quả.
    expect(rel(rounded.I22, rounded.I33)).toBeLessThan(1e-12);
  });

  it("J (gần đúng) cùng bậc với công thức góc vuông, lệch dưới 10 %", () => {
    const sq = sectionProperties({ shape: "box", h: 0.2, b: 0.2, t: 0.01 });
    const rd = sectionProperties({ shape: "box", h: 0.2, b: 0.2, t: 0.01, r: 0.02 });
    expect(rel(rd.J, sq.J)).toBeLessThan(0.1);
  });

  it("bán kính góc lớn hơn nửa cạnh ngắn bị báo lỗi tiết diện", () => {
    const m = sampleModel();
    m.frameSections[0]!.geometry = { shape: "box", h: 0.2, b: 0.1, t: 0.005, r: 0.06 };
    expect(checkModel(m).some((i) => i.code === "invalid_section")).toBe(true);
    m.frameSections[0]!.geometry = { shape: "box", h: 0.2, b: 0.1, t: 0.005, r: 0.01 };
    expect(checkModel(m).some((i) => i.code === "invalid_section")).toBe(false);
  });
});
