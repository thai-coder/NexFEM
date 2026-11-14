/**
 * Đọc cú pháp file văn bản ETABS `.e2k` thành các bản ghi thô theo từng phần (`$ TÊN PHẦN`).
 *
 * Chỉ tách cú pháp, không diễn giải kỹ thuật. Cú pháp được kiểm chứng trên file ETABS 23.2.0 thật
 * (`tests/fixtures/csi/etabs/…`): mỗi dòng là một bản ghi; chuỗi trong ngoặc kép; một đối tượng có thể
 * xuất hiện ở nhiều dòng; có chỗ chuỗi ngoặc kép dính liền từ khoá sau (`RELEASE "M2I M3I"LENGTHOFFI 0`).
 */

export interface E2kToken {
  text: string;
  quoted: boolean;
}

export interface E2kRecord {
  /** Số dòng trong file (bắt đầu từ 1). */
  line: number;
  tokens: E2kToken[];
}

export interface E2kFile {
  /** Bản ghi theo tên phần, giữ thứ tự xuất hiện. Tên phần đã bỏ khoảng trắng thừa, ví dụ "POINT COORDINATES". */
  sections: Map<string, E2kRecord[]>;
  /** Dòng tiêu đề phần cho từng tên (dòng đầu tiên nếu phần lặp lại). */
  sectionLines: Map<string, number>;
  /** Số dòng không thuộc phần nào (trước phần đầu tiên), không tính dòng trống. */
  orphanLines: number[];
}

const TOKEN = /"([^"]*)"|([^\s"]+)/g;

/** Tách một dòng thành token: chuỗi trong ngoặc kép hoặc cụm không có khoảng trắng / ngoặc kép. */
export function tokenizeE2kLine(line: string): E2kToken[] {
  const out: E2kToken[] = [];
  for (const m of line.matchAll(TOKEN)) {
    if (m[1] !== undefined) out.push({ text: m[1], quoted: true });
    else if (m[2] !== undefined) out.push({ text: m[2], quoted: false });
  }
  return out;
}

/** Giải mã byte của file: UTF-8 nếu hợp lệ, ngược lại Windows-1252 (bảng mã ANSI của ETABS cũ). */
export function decodeE2k(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * Tách file thành các phần. Dòng bắt đầu bằng `$` mở phần mới, trừ dòng `$ File …` (dòng đầu ghi đường dẫn)
 * và `$ END OF MODEL FILE`. Dòng trống bị bỏ qua.
 */
export function parseE2k(text: string): E2kFile {
  const sections = new Map<string, E2kRecord[]>();
  const sectionLines = new Map<string, number>();
  const orphanLines: number[] = [];
  let current: E2kRecord[] | null = null;
  const lines = text.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const lineNo = i + 1;
    if (raw.startsWith("$")) {
      const name = raw.slice(1).trim().replace(/\s+/g, " ");
      if (/^File\b/i.test(name) || /^END OF MODEL FILE/i.test(name)) {
        current = null;
        continue;
      }
      if (!sections.has(name)) {
        sections.set(name, []);
        sectionLines.set(name, lineNo);
      }
      current = sections.get(name)!;
      continue;
    }
    if (!raw.trim()) continue;
    const tokens = tokenizeE2kLine(raw);
    if (!tokens.length) continue;
    if (current) current.push({ line: lineNo, tokens });
    else orphanLines.push(lineNo);
  }
  return { sections, sectionLines, orphanLines };
}

/** Tìm phần theo tên; tên phần ETABS đôi khi có đuôi mô tả ("STORIES - IN SEQUENCE FROM TOP"). */
export function e2kSection(file: E2kFile, prefix: string): E2kRecord[] {
  const exact = file.sections.get(prefix);
  if (exact) return exact;
  for (const [name, recs] of file.sections) if (name.startsWith(prefix)) return recs;
  return [];
}

/**
 * Cặp `TỪKHOÁ giá trị` từ vị trí `start`. Từ khoá là token không ngoặc kép viết hoa.
 * Trả về danh sách theo thứ tự để giữ cặp lặp lại (ví dụ nhiều `LOADPAT … SF …` trên một dòng).
 */
export function e2kPairs(rec: E2kRecord, start: number): [string, E2kToken][] {
  const out: [string, E2kToken][] = [];
  const t = rec.tokens;
  for (let i = start; i < t.length; i++) {
    const k = t[i]!;
    if (k.quoted || !/^[A-Z][A-Z0-9_]*$/.test(k.text)) continue;
    const v = t[i + 1];
    if (!v) {
      out.push([k.text, { text: "", quoted: false }]);
      continue;
    }
    out.push([k.text, v]);
    i++;
  }
  return out;
}

/** Số trong file (cho phép dạng 1.17E-05, -0). NaN nếu không phải số. */
export function e2kNumber(s: string | undefined): number {
  if (s === undefined || s.trim() === "") return Number.NaN;
  const v = Number(s);
  return Number.isFinite(v) ? v : Number.NaN;
}
