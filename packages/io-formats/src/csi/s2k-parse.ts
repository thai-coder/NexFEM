/**
 * Đọc cú pháp file văn bản SAP2000 `.s2k` / `.$2k` thành các bảng.
 *
 * Kiểm chứng trên hai file SAP2000 thật (23.1.0 và 25.3.1, `tests/fixtures/csi/sap2000/`):
 * - mỗi bảng mở bằng `TABLE:  "TÊN BẢNG"`; một file thật có tiêu đề thiếu dấu ngoặc kép đóng nên phải chịu được;
 * - mỗi bản ghi là các cặp `Tên=Giá trị`, giá trị có khoảng trắng nằm trong ngoặc kép;
 * - bản ghi dài nối sang dòng sau bằng ` _` ở cuối dòng;
 * - file kết thúc bằng `END TABLE DATA`; dòng đầu là đường dẫn file khi lưu.
 */

export interface S2kRecord {
  /** Số dòng bắt đầu bản ghi (từ 1). */
  line: number;
  fields: Map<string, string>;
}

export interface S2kFile {
  /** Bảng theo tên, giữ thứ tự; bảng trùng tên được gộp. */
  tables: Map<string, S2kRecord[]>;
  tableLines: Map<string, number>;
  /** Đường dẫn file lúc lưu, ghi ở dòng đầu (`File … was saved on …`); rỗng nếu không có. */
  savedPath: string;
}

const FIELD = /([A-Za-z_][A-Za-z0-9_]*)=("([^"]*)"|\S+)/g;

/** Tách các cặp `Tên=Giá trị` trong một bản ghi đã nối dòng. */
export function s2kFields(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(FIELD)) {
    const key = m[1]!;
    const value = m[3] !== undefined ? m[3] : m[2]!;
    if (!out.has(key)) out.set(key, value);
  }
  return out;
}

export function parseS2k(text: string): S2kFile {
  const tables = new Map<string, S2kRecord[]>();
  const tableLines = new Map<string, number>();
  const lines = text.split(/\r\n|\n|\r/);
  const savedPath = /^File (.+?) was saved on\b/.exec(lines[0] ?? "")?.[1] ?? "";
  let current: S2kRecord[] | null = null;
  let buf = "";
  let bufLine = 0;
  const flush = () => {
    if (current && buf.trim()) current.push({ line: bufLine, fields: s2kFields(buf) });
    buf = "";
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const lineNo = i + 1;
    const header = /^TABLE:\s+"?([^"]*)"?\s*$/.exec(raw);
    if (header) {
      flush();
      const name = header[1]!.trim();
      if (!tables.has(name)) {
        tables.set(name, []);
        tableLines.set(name, lineNo);
      }
      current = tables.get(name)!;
      continue;
    }
    if (/^END TABLE DATA/.test(raw)) {
      flush();
      current = null;
      continue;
    }
    if (!current) continue;
    const trimmed = raw.trimEnd();
    if (!trimmed.trim()) {
      flush();
      continue;
    }
    const cont = trimmed.endsWith(" _");
    if (!buf) bufLine = lineNo;
    buf += ` ${(cont ? trimmed.slice(0, -2) : trimmed).trim()}`;
    if (!cont) flush();
  }
  flush();
  return { tables, tableLines, savedPath };
}

/** Bảng theo tên chính xác (rỗng nếu không có). */
export function s2kTable(file: S2kFile, name: string): S2kRecord[] {
  return file.tables.get(name) ?? [];
}

/** Số trong file; NaN nếu không phải số. */
export function s2kNumber(v: string | undefined): number {
  if (v === undefined || v.trim() === "") return Number.NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** "Yes"/"No" của SAP2000. */
export function s2kYes(v: string | undefined): boolean {
  return (v ?? "").toLowerCase() === "yes";
}
