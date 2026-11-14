import { importE2k, type E2kImportResult } from "./e2k-import.ts";

export type CsiFormat = "e2k" | "s2k" | "unknown";

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

/**
 * Nhập file CSI bất kỳ: `.e2k` qua bộ nhập ETABS; `.s2k` và định dạng lạ trả về mô hình trống
 * kèm một lỗi giải thích (bộ nhập SAP2000 chưa có vì chưa có file `.s2k` thật trong repo để kiểm chứng).
 */
export function importCsi(text: string): CsiImportResult {
  const format = detectCsiFormat(text);
  if (format === "e2k") return { format, ...importE2k(text) };
  const empty = importE2k("");
  const sap = format === "s2k" ? s2kProgram(text) : { program: "", version: "" };
  return {
    format,
    model: empty.model,
    report: {
      program: sap.program,
      version: sap.version,
      units: null,
      counts: {},
      mapping: { joints: {}, frames: {}, shells: {} },
      diagnostics: [
        format === "s2k"
          ? { level: "error", code: "format_s2k_unsupported", params: { program: sap.program || "SAP2000", version: sap.version || "?" }, count: 1, lines: [], objects: [] }
          : { level: "error", code: "format_unknown", params: {}, count: 1, lines: [], objects: [] },
      ],
    },
  };
}
