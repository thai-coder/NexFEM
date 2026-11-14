import { sectionProperties } from "./sections.ts";
import type { FrameShape } from "./schema.ts";

/**
 * Thư viện thép hình do người dùng nạp từ file CSV.
 * NexFEM không phân phối bảng của nhà sản xuất hay tiêu chuẩn (xem docs/steel-library.md):
 * người dùng nạp bảng mình có quyền dùng, NexFEM tính đặc trưng từ kích thước và so với giá trị trong bảng.
 */
export interface SteelLibraryRow {
  /** Tiêu chuẩn hoặc nguồn, ví dụ "EN 10365:2017", "TCVN 7571-16:2017", "AISC Shapes Database v16.0". */
  standard: string;
  /** Họ tiết diện: IPE, HEA, W, I, HSS… */
  family: string;
  name: string;
  geometry: FrameShape;
  /** Giá trị trong bảng gốc (SI: m², m⁴) để đối chiếu; thiếu thì bỏ qua. */
  ref: { A?: number; I33?: number; I22?: number; J?: number };
}

export interface LibraryParseResult {
  rows: SteelLibraryRow[];
  errors: { line: number; message: string }[];
  /** "nexfem": định dạng CSV của NexFEM; "aisc": bảng AISC Shapes Database lưu thành CSV. */
  format: "nexfem" | "aisc";
}

/** Tách một dòng CSV có hỗ trợ dấu ngoặc kép. */
function splitCsv(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) out.push(cur.trim()), (cur = "");
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

// Làm tròn 12 chữ số có nghĩa sau khi đổi đơn vị để 7.1 mm lưu thành đúng 0.0071 m (tránh 0.0070999…).
const clean = (v: number) => Number(v.toPrecision(12));
const mm = (v: number) => clean(v / 1000);
const CM2 = 1e4;
const CM4 = 1e8;
const IN = 0.0254;

/**
 * Đọc CSV thư viện thép.
 *
 * Định dạng NexFEM (dấu phẩy, hoặc chấm phẩy kèm dấu thập phân phẩy), dòng đầu là tên cột:
 * `standard,family,name,shape,h,b,tw,tf,r,d,t,A,Iy,Iz,It`
 * - shape `I`: h, b, tw, tf, r (mm). shape `box`: h, b, t (mm). shape `pipe`: d, t (mm).
 * - A (cm²), Iy = I33 trục mạnh, Iz = I22, It = J (cm⁴) là giá trị bảng để đối chiếu, có thể để trống.
 *
 * Bảng AISC Shapes Database (lưu từ Excel thành CSV, đơn vị inch) được nhận ra qua cột `AISC_Manual_Label`:
 * W, M, S, HP → I với r = kdes − tf; HSS chữ nhật → box (t = tdes); PIPE và HSS tròn → pipe.
 */
export function parseSteelLibraryCsv(text: string): LibraryParseResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim() !== "");
  const errors: LibraryParseResult["errors"] = [];
  if (headerIdx < 0) return { rows: [], errors: [{ line: 1, message: "empty" }], format: "nexfem" };
  const headerLine = lines[headerIdx]!;
  const delim = (headerLine.match(/;/g)?.length ?? 0) > (headerLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitCsv(headerLine, delim).map((h) => h.trim());
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const aisc = col("AISC_Manual_Label") >= 0;
  const rows: SteelLibraryRow[] = [];

  for (let li = headerIdx + 1; li < lines.length; li++) {
    const line = lines[li]!;
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const cells = splitCsv(line, delim);
    const get = (name: string) => {
      const i = col(name);
      return i >= 0 ? (cells[i] ?? "").trim() : "";
    };
    const num = (name: string): number | undefined => {
      const raw = get(name).replace(delim === ";" ? "," : "\u0000", ".");
      if (raw === "" || raw === "–" || raw === "-") return undefined;
      const v = Number(raw);
      return Number.isFinite(v) ? v : Number.NaN;
    };
    const fail = (message: string) => errors.push({ line: li + 1, message });
    try {
      const row = aisc ? aiscRow(get, num) : nexfemRow(get, num);
      if (row === null) continue; // loại tiết diện chưa hỗ trợ (bỏ qua, không phải lỗi)
      if (typeof row === "string") fail(row);
      else rows.push(row);
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  }
  return { rows, errors, format: aisc ? "aisc" : "nexfem" };
}

type Get = (name: string) => string;
type Num = (name: string) => number | undefined;

const need = (v: number | undefined, name: string): number => {
  if (v === undefined || !Number.isFinite(v) || v <= 0) throw new Error(`${name} missing or invalid`);
  return v;
};
/** Giá trị dương tuỳ chọn; `div` là số chia đổi đơn vị (cm² → m²: 1e4), `mul` là số nhân (inch). */
const opt = (v: number | undefined, div: number, mul = 1) => (v !== undefined && Number.isFinite(v) && v > 0 ? (v * mul) / div : undefined);
const ref = (A?: number, I33?: number, I22?: number, J?: number): SteelLibraryRow["ref"] =>
  Object.fromEntries(Object.entries({ A, I33, I22, J }).filter(([, v]) => v !== undefined)) as SteelLibraryRow["ref"];

function nexfemRow(get: Get, num: Num): SteelLibraryRow | string {
  const name = get("name");
  if (!name) return "name missing";
  const shape = get("shape").toLowerCase();
  let geometry: FrameShape;
  if (shape === "i") {
    const r = num("r");
    geometry = { shape: "I", h: mm(need(num("h"), "h")), bf: mm(need(num("b"), "b")), tw: mm(need(num("tw"), "tw")), tf: mm(need(num("tf"), "tf")), ...(r !== undefined && r > 0 ? { r: mm(r) } : {}) };
  } else if (shape === "box") {
    geometry = { shape: "box", h: mm(need(num("h"), "h")), b: mm(need(num("b"), "b")), t: mm(need(num("t"), "t")) };
  } else if (shape === "pipe") {
    geometry = { shape: "pipe", d: mm(need(num("d"), "d")), t: mm(need(num("t"), "t")) };
  } else return `shape "${get("shape")}" not supported (I, box, pipe)`;
  return {
    standard: get("standard"),
    family: get("family"),
    name,
    geometry,
    ref: ref(opt(num("A"), CM2), opt(num("Iy"), CM4), opt(num("Iz"), CM4), opt(num("It"), CM4)),
  };
}

function aiscRow(get: Get, num: Num): SteelLibraryRow | string | null {
  const type = get("Type").toUpperCase();
  const name = get("AISC_Manual_Label");
  if (!name) return "AISC_Manual_Label missing";
  const I4 = IN ** 4;
  const A = opt(num("A"), 1, IN * IN);
  const J = opt(num("J"), 1, I4);
  const base = { standard: "AISC Shapes Database", family: type, name };
  if (["W", "M", "S", "HP"].includes(type)) {
    const tf = need(num("tf"), "tf");
    const kdes = num("kdes");
    const r = kdes !== undefined && kdes > tf ? kdes - tf : 0;
    // Bảng AISC: S có cánh vát; mô hình chữ I cánh song song chỉ gần đúng cho S.
    return {
      ...base,
      geometry: { shape: "I", h: clean(need(num("d"), "d") * IN), bf: clean(need(num("bf"), "bf") * IN), tw: clean(need(num("tw"), "tw") * IN), tf: clean(tf * IN), ...(r > 0 ? { r: clean(r * IN) } : {}) },
      ref: ref(A, opt(num("Ix"), 1, I4), opt(num("Iy"), 1, I4), J),
    };
  }
  if (type === "HSS" && num("Ht") !== undefined && num("B") !== undefined) {
    return {
      ...base,
      geometry: { shape: "box", h: clean(need(num("Ht"), "Ht") * IN), b: clean(need(num("B"), "B") * IN), t: clean(need(num("tdes"), "tdes") * IN) },
      ref: ref(A, opt(num("Ix"), 1, I4), opt(num("Iy"), 1, I4), J),
    };
  }
  if (type === "PIPE" || (type === "HSS" && num("OD") !== undefined)) {
    return {
      ...base,
      geometry: { shape: "pipe", d: clean(need(num("OD"), "OD") * IN), t: clean(need(num("tdes"), "tdes") * IN) },
      ref: ref(A, opt(num("Ix"), 1, I4), opt(num("Iy"), 1, I4), J),
    };
  }
  return null; // C, MC, L, WT, 2L…: chưa có hình tương ứng trong NexFEM
}

export interface LibraryCheck {
  row: SteelLibraryRow;
  /** Sai lệch tương đối (tính − bảng)/bảng cho từng đại lượng có trong bảng. */
  dev: Partial<Record<"A" | "I33" | "I22" | "J", number>>;
  /** Vượt ngưỡng: A, I ≤ 1 % (hộp ≤ 3 % vì chưa tính bán kính góc), J ≤ 5 %. */
  flagged: (keyof LibraryCheck["dev"])[];
}

export const LIBRARY_TOLERANCE = { A: 0.01, I33: 0.01, I22: 0.01, J: 0.05, boxAI: 0.03 } as const;

/** Tính đặc trưng từ kích thước và so với giá trị trong bảng gốc. */
export function checkSteelLibrary(rows: SteelLibraryRow[]): LibraryCheck[] {
  return rows.map((row) => {
    const p = sectionProperties(row.geometry);
    const dev: LibraryCheck["dev"] = {};
    const flagged: LibraryCheck["flagged"] = [];
    for (const k of ["A", "I33", "I22", "J"] as const) {
      const want = row.ref[k];
      if (!want) continue;
      const d = (p[k] - want) / want;
      dev[k] = d;
      const tol = k === "J" ? LIBRARY_TOLERANCE.J : row.geometry.shape === "box" ? LIBRARY_TOLERANCE.boxAI : LIBRARY_TOLERANCE[k];
      if (Math.abs(d) > tol) flagged.push(k);
    }
    return { row, dev, flagged };
  });
}
