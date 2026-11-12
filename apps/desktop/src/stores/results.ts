import { create } from "zustand";
import type { Results } from "../services/solver.ts";

interface ResultsState {
  results: Results | null;
  /** Thời gian giải (ms). */
  elapsed: number;
  /** Trường hợp tải / tổ hợp đang xem. */
  activeCase: string | null;
  showDeformed: boolean;
  /** null: tự tính hệ số từ mô hình và chuyển vị của case hiện tại. */
  deformationScale: number | null;
  setResult(results: Results, elapsed: number): void;
  selectCase(id: string): void;
  toggleDeformed(): void;
  setDeformationScale(scale: number | null): void;
  clear(): void;
}

export const useResults = create<ResultsState>((set, get) => ({
  results: null,
  elapsed: 0,
  activeCase: null,
  showDeformed: false,
  deformationScale: null,
  setResult: (results, elapsed) => set({ results, elapsed, activeCase: results.cases[0]?.id ?? null }),
  selectCase: (id) => {
    if (get().results?.cases.some((c) => c.id === id)) set({ activeCase: id });
  },
  toggleDeformed: () => set((s) => ({ showDeformed: !s.showDeformed })),
  setDeformationScale: (scale) => {
    if (scale === null || (Number.isFinite(scale) && scale > 0)) set({ deformationScale: scale });
  },
  clear: () => set({ results: null, activeCase: null, elapsed: 0, showDeformed: false, deformationScale: null }),
}));

export const selectActiveCase = (state: ResultsState) => state.results?.cases.find((c) => c.id === state.activeCase);

export function selectDeformationCase(state: ResultsState) {
  const result = selectActiveCase(state);
  return result?.kind === "case" || result?.kind === "combo" ? result : undefined;
}
