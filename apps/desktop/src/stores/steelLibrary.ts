import { checkSteelLibrary, parseSteelLibraryCsv, type LibraryCheck, type SteelLibraryRow } from "@nexfem/model-core";
import { create } from "zustand";
import { load, remove, save } from "./persist.ts";

/** Thư viện thép người dùng đã nạp (lưu trên máy, không nằm trong file dự án). */
export interface SteelLibraryState {
  fileName: string | null;
  importedAt: string | null;
  rows: SteelLibraryRow[];
  checks: LibraryCheck[];
  /** Lỗi theo dòng của lần nạp gần nhất. */
  errors: { line: number; message: string }[];
  importText(fileName: string, text: string): { added: number; errors: number };
  clear(): void;
}

const KEY = "steelLibrary";
type Saved = { fileName: string; importedAt: string; rows: SteelLibraryRow[] };

const saved = load<Saved | null>(KEY, null);

export const useSteelLibrary = create<SteelLibraryState>((set) => ({
  fileName: saved?.fileName ?? null,
  importedAt: saved?.importedAt ?? null,
  rows: saved?.rows ?? [],
  checks: saved ? checkSteelLibrary(saved.rows) : [],
  errors: [],
  importText: (fileName, text) => {
    const r = parseSteelLibraryCsv(text);
    const importedAt = new Date().toISOString();
    if (r.rows.length) {
      save(KEY, { fileName, importedAt, rows: r.rows } satisfies Saved);
      set({ fileName, importedAt, rows: r.rows, checks: checkSteelLibrary(r.rows), errors: r.errors });
    } else set({ errors: r.errors });
    return { added: r.rows.length, errors: r.errors.length };
  },
  clear: () => {
    remove(KEY);
    set({ fileName: null, importedAt: null, rows: [], checks: [], errors: [] });
  },
}));

/** Mở hộp chọn file CSV (dùng được cả trong Tauri và trình duyệt). */
export function pickCsvText(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.style.display = "none";
    input.dataset.testid = "steel-library-input";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      resolve(file ? { name: file.name, text: await file.text() } : null);
    });
    document.body.appendChild(input);
    input.click();
  });
}
