/**
 * Đọc danh sách nhịp/chiều cao: "6, 6, 7.2", "3@6", "2@3.6, 4.2" (dấu phẩy, chấm phẩy hoặc khoảng trắng).
 * Trả về null nếu sai cú pháp hoặc có giá trị ≤ 0.
 */
export function parseSpans(text: string, max = 200): number[] | null {
  const parts = text
    .split(/[;,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const out: number[] = [];
  for (const p of parts) {
    const m = /^(\d+)\s*[@x×*]\s*([\d.]+)$/i.exec(p);
    if (m) {
      const n = Number(m[1]);
      const v = Number(m[2]);
      if (!Number.isInteger(n) || n < 1 || !(v > 0)) return null;
      for (let i = 0; i < n; i++) out.push(v);
    } else {
      const v = Number(p);
      if (!(v > 0) || !Number.isFinite(v)) return null;
      out.push(v);
    }
    if (out.length > max) return null;
  }
  return out;
}

/** Viết gọn danh sách: [6,6,6,7.2] → "3@6, 7.2". */
export function formatSpans(values: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < values.length; ) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[i]) j++;
    const n = j - i + 1;
    out.push(n > 1 ? `${n}@${values[i]}` : String(values[i]));
    i = j + 1;
  }
  return out.join(", ");
}
