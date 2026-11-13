import type { FrameShape } from "./schema.ts";

export interface SectionProperties {
  /** Diện tích (m²). */
  A: number;
  /** Mô men quán tính quanh trục 3 (trục mạnh) (m⁴). */
  I33: number;
  /** Mô men quán tính quanh trục 2 (trục yếu) (m⁴). */
  I22: number;
  /** Hằng số xoắn (m⁴): chính xác cho tròn/ống, gần đúng cho chữ nhật (≤ 0,2 %), chữ I và hộp. */
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
    case "I":
      return iSection(g.h, g.bf, g.tf, g.tw, g.r ?? 0);
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

/**
 * Tiết diện chữ I đối xứng kép. Với thép cán (r > 0) tính thêm bốn góc lượn chân:
 * mỗi góc là hình vuông r×r trừ một phần tư hình tròn bán kính r (diện tích (1 − π/4)r²).
 * Hằng số xoắn J khi r > 0 theo El Darwish & Johnston (1965), công thức dùng cho bảng thép cán châu Âu;
 * khi r = 0 dùng công thức thành mỏng Σ b·t³/3 như trước (giữ nguyên kết quả mô hình cũ).
 * Đối chiếu bảng EN 10365 (IPE 200/300, HEA 200, HEB 300): A, I33, I22 lệch ≤ 0,05 %, J lệch ≤ 2,3 %.
 */
export function iSection(h: number, bf: number, tf: number, tw: number, r = 0): SectionProperties {
  const hw = h - 2 * tf;
  let A = 2 * bf * tf + hw * tw;
  let I33 = (bf * h ** 3 - (bf - tw) * hw ** 3) / 12;
  let I22 = (2 * tf * bf ** 3 + hw * tw ** 3) / 12;
  let J = (2 * bf * tf ** 3 + hw * tw ** 3) / 3;
  if (r > 0) {
    const af = (1 - Math.PI / 4) * r * r; // diện tích một góc lượn
    const e = (r * (10 - 3 * Math.PI)) / (12 - 3 * Math.PI); // trọng tâm góc lượn cách hai cạnh thẳng
    const own = (1 - (5 * Math.PI) / 16) * r ** 4 - af * e * e; // mô men quán tính riêng của góc lượn
    const y = h / 2 - tf - e; // cách trục mạnh
    const z = tw / 2 + e; // cách trục yếu
    A += 4 * af;
    I33 += 4 * (own + af * y * y);
    I22 += 4 * (own + af * z * z);
    const alpha = -0.042 + (0.2204 * tw) / tf + (0.1355 * r) / tf - (0.0865 * r * tw) / tf ** 2 - (0.0725 * tw ** 2) / tf ** 2;
    const D = ((tf + r) ** 2 + tw * (r + tw / 4)) / (2 * r + tf);
    J = (2 / 3) * bf * tf ** 3 + (1 / 3) * hw * tw ** 3 + 2 * alpha * D ** 4 - 0.42 * tf ** 4;
  }
  return { A, I33, I22, J };
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
