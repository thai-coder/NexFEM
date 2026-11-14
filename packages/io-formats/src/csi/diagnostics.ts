/** Thông báo của bộ nhập CSI, gộp theo mức + mã + tham số; dùng chung cho .e2k và .s2k. */

export type ImportLevel = "error" | "warning" | "info";

export interface ImportDiagnostic {
  level: ImportLevel;
  /** Mã để giao diện dịch; tham số trong `params`. */
  code: string;
  params: Record<string, string | number>;
  /** Số lần gặp. */
  count: number;
  /** Tối đa 20 số dòng trong file. */
  lines: number[];
  /** Tối đa 20 tên đối tượng trong file nguồn. */
  objects: string[];
}

const MAX_LIST = 20;

export class Diagnostics {
  #map = new Map<string, ImportDiagnostic>();
  add(level: ImportLevel, code: string, params: Record<string, string | number> = {}, at?: { line?: number; object?: string }): void {
    const key = `${level}|${code}|${JSON.stringify(params)}`;
    let d = this.#map.get(key);
    if (!d) {
      d = { level, code, params, count: 0, lines: [], objects: [] };
      this.#map.set(key, d);
    }
    d.count++;
    if (at?.line !== undefined && d.lines.length < MAX_LIST) d.lines.push(at.line);
    if (at?.object !== undefined && d.objects.length < MAX_LIST && !d.objects.includes(at.object)) d.objects.push(at.object);
  }
  list(): ImportDiagnostic[] {
    const rank: Record<ImportLevel, number> = { error: 0, warning: 1, info: 2 };
    return [...this.#map.values()].sort((a, b) => rank[a.level] - rank[b.level]);
  }
}

