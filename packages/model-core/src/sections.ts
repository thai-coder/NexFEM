import type { FrameShape } from "./schema.ts";

export interface SectionProperties {
  /** Diện tích (m²). */
  A: number;
  /** Mô men quán tính quanh trục 3 (trục mạnh) (m⁴). */
  I33: number;
  /** Mô men quán tính quanh trục 2 (trục yếu) (m⁴). */
  I22: number;
  /** Hằng số xoắn (m⁴), gần đúng. */
  J: number;
}

/** Đặc trưng hình học của tiết diện thanh, đơn vị m. */
export function sectionProperties(g: FrameShape): SectionProperties {
  switch (g.shape) {
    case "rect": {
      const { b, h } = g;
      const a = Math.max(b, h);
      const c = Math.min(b, h);
      // Công thức gần đúng của Roark cho tiết diện chữ nhật đặc.
      const J = a * c ** 3 * (1 / 3 - 0.21 * (c / a) * (1 - c ** 4 / (12 * a ** 4)));
      return { A: b * h, I33: (b * h ** 3) / 12, I22: (h * b ** 3) / 12, J };
    }
    case "circle": {
      const r = g.d / 2;
      const I = (Math.PI * r ** 4) / 4;
      return { A: Math.PI * r * r, I33: I, I22: I, J: 2 * I };
    }
    case "I": {
      const { h, bf, tf, tw } = g;
      const hw = h - 2 * tf;
      const A = 2 * bf * tf + hw * tw;
      const I33 = (bf * h ** 3 - (bf - tw) * hw ** 3) / 12;
      const I22 = (2 * tf * bf ** 3 + hw * tw ** 3) / 12;
      const J = (2 * bf * tf ** 3 + hw * tw ** 3) / 3;
      return { A, I33, I22, J };
    }
    case "box": {
      const { h, b, t } = g;
      const hi = h - 2 * t;
      const bi = b - 2 * t;
      const A = b * h - bi * hi;
      const I33 = (b * h ** 3 - bi * hi ** 3) / 12;
      const I22 = (h * b ** 3 - hi * bi ** 3) / 12;
      const J = (2 * t * (b - t) ** 2 * (h - t) ** 2) / (b + h - 2 * t);
      return { A, I33, I22, J };
    }
    case "pipe": {
      const ro = g.d / 2;
      const ri = ro - g.t;
      const I = (Math.PI * (ro ** 4 - ri ** 4)) / 4;
      return { A: Math.PI * (ro * ro - ri * ri), I33: I, I22: I, J: 2 * I };
    }
  }
}

/** Kích thước bao (m) để vẽ tiết diện: [rộng, cao]. */
export function sectionExtent(g: FrameShape): [number, number] {
  switch (g.shape) {
    case "rect":
      return [g.b, g.h];
    case "circle":
      return [g.d, g.d];
    case "I":
      return [g.bf, g.h];
    case "box":
      return [g.b, g.h];
    case "pipe":
      return [g.d, g.d];
  }
}
