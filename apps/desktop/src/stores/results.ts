import { create } from "zustand";
import type { Results } from "../services/solver.ts";

interface ResultsState {
  results: Results | null;
  /** Thời gian giải (ms). */
  elapsed: number;
  /** Trường hợp tải / tổ hợp đang xem. */
  activeCase: string | null;
  set(patch: Partial<ResultsState>): void;
  clear(): void;
}

export const useResults = create<ResultsState>((set) => ({
  results: null,
  elapsed: 0,
  activeCase: null,
  set: (patch) => set(patch),
  clear: () => set({ results: null, activeCase: null, elapsed: 0 }),
}));
