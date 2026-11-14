import type { E2kImportResult } from "@nexfem/io-formats";
import { create } from "zustand";

/** Kết quả nhập CSI đang chờ người dùng xem báo cáo và quyết định mở mô hình. */
export const useCsiImport = create<{ fileName: string | null; result: E2kImportResult | null; set(fileName: string, result: E2kImportResult): void; clear(): void }>((set) => ({
  fileName: null,
  result: null,
  set: (fileName, result) => set({ fileName, result }),
  clear: () => set({ fileName: null, result: null }),
}));
