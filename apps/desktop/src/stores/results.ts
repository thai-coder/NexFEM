import { create } from "zustand";
import type { Results } from "../services/solver.ts";

interface ResultsState {
  results: Results | null;
  /** Thời gian giải (ms). */
  elapsed: number;
  /** Trường hợp tải / tổ hợp đang xem. */
  activeCase: string | null;
  setResult(results: Results, elapsed: number): void;
  selectCase(id: string): void;
  clear(): void;
}

export const useResults = create<ResultsState>((set, get) => ({
  results: null,
  elapsed: 0,
  activeCase: null,
  setResult: (results, elapsed) => set({ results, elapsed, activeCase: results.cases[0]?.id ?? null }),
  selectCase: (id) => {
    if (get().results?.cases.some((c) => c.id === id)) set({ activeCase: id });
  },
  clear: () => set({ results: null, activeCase: null, elapsed: 0 }),
}));

export const selectActiveCase = (state: ResultsState) => state.results?.cases.find((c) => c.id === state.activeCase);
