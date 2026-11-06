import type { UnitSystem } from "./schema.ts";

/**
 * Mô hình luôn lưu nội bộ theo kN, m, °C. Hệ đơn vị của người dùng chỉ dùng để hiển thị và nhập liệu.
 */
export const FORCE_TO_KN: Record<UnitSystem["force"], number> = {
  N: 1e-3,
  kN: 1,
  kgf: 9.80665e-3,
  tonf: 9.80665,
};

export const LENGTH_TO_M: Record<UnitSystem["length"], number> = {
  mm: 1e-3,
  cm: 1e-2,
  m: 1,
};

export type Quantity = "length" | "force" | "stress" | "moment" | "forcePerLength" | "area" | "inertia";

/** Hệ số đổi từ đơn vị nội bộ (kN, m) sang đơn vị hiển thị. */
export function displayFactor(q: Quantity, u: UnitSystem): number {
  const f = 1 / FORCE_TO_KN[u.force];
  const l = 1 / LENGTH_TO_M[u.length];
  switch (q) {
    case "length":
      return l;
    case "force":
      return f;
    case "stress":
      return f / (l * l);
    case "moment":
      return f * l;
    case "forcePerLength":
      return f / l;
    case "area":
      return l * l;
    case "inertia":
      return l ** 4;
  }
}

export function unitLabel(q: Quantity, u: UnitSystem): string {
  switch (q) {
    case "length":
      return u.length;
    case "force":
      return u.force;
    case "stress":
      return `${u.force}/${u.length}²`;
    case "moment":
      return `${u.force}·${u.length}`;
    case "forcePerLength":
      return `${u.force}/${u.length}`;
    case "area":
      return `${u.length}²`;
    case "inertia":
      return `${u.length}⁴`;
  }
}

export function toDisplay(value: number, q: Quantity, u: UnitSystem): number {
  return value * displayFactor(q, u);
}

export function fromDisplay(value: number, q: Quantity, u: UnitSystem): number {
  return value / displayFactor(q, u);
}

export const UNIT_PRESETS: { label: string; units: UnitSystem }[] = [
  { label: "kN, m, C", units: { force: "kN", length: "m", temperature: "C" } },
  { label: "kN, mm, C", units: { force: "kN", length: "mm", temperature: "C" } },
  { label: "N, mm, C", units: { force: "N", length: "mm", temperature: "C" } },
  { label: "kgf, cm, C", units: { force: "kgf", length: "cm", temperature: "C" } },
  { label: "tonf, m, C", units: { force: "tonf", length: "m", temperature: "C" } },
];

export function unitsLabel(u: UnitSystem): string {
  return `${u.force}, ${u.length}, ${u.temperature}`;
}
