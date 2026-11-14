import { decodeE2k } from "./e2k-parse.ts";
import { importE2k, type E2kImportResult, type ImportDiagnostic } from "./e2k-import.ts";
import { importS2k } from "./s2k-import.ts";

/** Định dạng nhận ra từ nội dung file. `sdb`: file SAP2000 nhị phân; `binary`: file nhị phân khác (ví dụ ETABS `.edb`). */
export type CsiFormat = "e2k" | "s2k" | "sdb" | "binary" | "unknown";

/** Định dạng người dùng chọn trong menu "Nhập file". */
export type CsiExpected = "e2k" | "s2k";

/**
 * Nhận diện file văn bản CSI theo nội dung (không theo đuôi file):
 * - ETABS `.e2k`: các phần bắt đầu bằng `$ …`, có `$ PROGRAM INFORMATION` hoặc `PROGRAM "ETABS"`;
 * - SAP2000 `.s2k`: các bảng `TABLE:  "…"` với cặp `Tên=Giá trị`.
 */
export function detectCsiFormat(text: string): CsiFormat {
  const head = text.slice(0, 200_000);
  if (/^\s*TABLE:\s*"/m.test(head)) return "s2k";
  if (/^\$\s*PROGRAM INFORMATION/m.test(head) || /^\s*PROGRAM\s+"ETABS"/m.test(head)) return "e2k";
  return "unknown";
}

/**
 * File nhị phân: có byte 0 trong 4 KB đầu. File `.sdb` thật (SAP2000 25.3.1, `tests/fixtures/csi/sap2000/Roof_model.sdb`)
 * bắt đầu bằng "SAP2000" rồi phiên bản, mỗi trường đệm 16 byte; nội dung còn lại là định dạng riêng của CSI.
 */
export function detectCsiBinary(bytes: Uint8Array): { format: "sdb" | "binary"; version: string } | null {
  const head = bytes.subarray(0, 4096);
  if (!head.includes(0)) return null;
  const field = (at: number) => new TextDecoder("latin1").decode(bytes.subarray(at, at + 16)).replace(/[\0\s]+$/, "");
  if (field(0) === "SAP2000") return { format: "sdb", version: /^[\d.]+$/.test(field(16)) ? field(16) : "" };
  return { format: "binary", version: "" };
}

/** Tên và phiên bản chương trình trong bảng PROGRAM CONTROL của `.s2k` (nếu có). */
export function s2kProgram(text: string): { program: string; version: string } {
  const head = text.slice(0, 50_000);
  const pick = (key: string) => new RegExp(`\\b${key}=("([^"]*)"|(\\S+))`).exec(head);
  const p = pick("ProgramName");
  const v = pick("Version");
  return { program: p?.[2] ?? p?.[3] ?? "", version: v?.[2] ?? v?.[3] ?? "" };
}

export interface CsiImportResult extends E2kImportResult {
  format: CsiFormat;
}

const one = (level: ImportDiagnostic["level"], code: string, params: ImportDiagnostic["params"] = {}): ImportDiagnostic => ({ level, code, params, count: 1, lines: [], objects: [] });

function failed(format: CsiFormat, program: string, version: string, diagnostic: ImportDiagnostic): CsiImportResult {
  const empty = importE2k("");
  return { format, model: empty.model, report: { program, version, units: null, counts: {}, mapping: { joints: {}, frames: {}, shells: {} }, diagnostics: [diagnostic] } };
}

/**
 * Nhập file văn bản CSI: nhận diện theo nội dung rồi dùng bộ nhập ETABS hoặc SAP2000.
 * `expected` là định dạng người dùng chọn trong menu; nếu nội dung là định dạng kia thì vẫn nhập theo nội dung và ghi cảnh báo.
 */
export function importCsi(text: string, expected?: CsiExpected): CsiImportResult {
  const format = detectCsiFormat(text);
  if (format === "unknown") return failed(format, "", "", one("error", "format_unknown"));
  const result: CsiImportResult = format === "e2k" ? { format, ...importE2k(text) } : { format, ...importS2k(text) };
  if (expected && expected !== format) result.report.diagnostics.unshift(one("warning", "format_mismatch", { expected: expected === "e2k" ? "ETABS" : "SAP2000", actual: format === "e2k" ? "ETABS" : "SAP2000" }));
  return result;
}

/** Nhập từ byte của file: file nhị phân (`.sdb`, `.edb`) được báo rõ cách xuất file văn bản; còn lại giải mã và nhập như `importCsi`. */
export function importCsiFile(bytes: Uint8Array, expected?: CsiExpected): CsiImportResult {
  const bin = detectCsiBinary(bytes);
  if (bin?.format === "sdb") return failed("sdb", "SAP2000", bin.version, one("error", "format_sdb_binary", { version: bin.version || "?" }));
  if (bin) return failed("binary", "", "", one("error", "format_binary", { program: expected === "s2k" ? "SAP2000" : "ETABS" }));
  return importCsi(decodeE2k(bytes), expected);
}
