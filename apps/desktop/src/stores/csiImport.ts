import type { CsiImportResult } from "@nexfem/io-formats";
import { create } from "zustand";

/** Kết quả nhập CSI đang chờ người dùng xem báo cáo và quyết định mở mô hình. */
export const useCsiImport = create<{ fileName: string | null; result: CsiImportResult | null; set(fileName: string, result: CsiImportResult): void; clear(): void }>((set) => ({
  fileName: null,
  result: null,
  set: (fileName, result) => set({ fileName, result }),
  clear: () => set({ fileName: null, result: null }),
}));
