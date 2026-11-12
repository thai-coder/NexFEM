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
  deformationAnimationStart: number | null;
  showMoment: boolean;
  momentScale: number | null;
  setResult(results: Results, elapsed: number): void;
  selectCase(id: string): void;
  toggleDeformed(): void;
  setDeformationScale(scale: number | null): void;
  toggleDeformationAnimation(): void;
  toggleMoment(): void;
  setMomentScale(scale: number | null): void;
  clear(): void;
}

export const useResults = create<ResultsState>((set, get) => ({
  results: null,
  elapsed: 0,
  activeCase: null,
  showDeformed: false,
  deformationScale: null,
  deformationAnimationStart: null,
  showMoment: false,
  momentScale: null,
  setResult: (results, elapsed) => set({ results, elapsed, activeCase: results.cases[0]?.id ?? null }),
  selectCase: (id) => {
    if (get().activeCase !== id && get().results?.cases.some((c) => c.id === id)) set({ activeCase: id, deformationAnimationStart: null });
  },
  toggleDeformed: () => set((s) => ({ showDeformed: !s.showDeformed, showMoment: false, deformationAnimationStart: null })),
  setDeformationScale: (scale) => {
    if (scale === null || (Number.isFinite(scale) && scale > 0)) set({ deformationScale: scale });
  },
  toggleDeformationAnimation: () => {
    const s = get();
    if (s.showDeformed && selectDeformationCase(s)) {
      set({ deformationAnimationStart: s.deformationAnimationStart === null ? performance.now() : null });
    }
  },
  toggleMoment: () => set((s) => ({ showMoment: !s.showMoment, showDeformed: false, deformationAnimationStart: null })),
  setMomentScale: (scale) => {
    if (scale === null || (Number.isFinite(scale) && scale > 0)) set({ momentScale: scale });
  },
  clear: () => set({
    results: null, activeCase: null, elapsed: 0, showDeformed: false, deformationScale: null,
    deformationAnimationStart: null, showMoment: false, momentScale: null,
  }),
}));

export const selectActiveCase = (state: ResultsState) => state.results?.cases.find((c) => c.id === state.activeCase);

export function selectDeformationCase(state: ResultsState) {
  const result = selectActiveCase(state);
  return result?.kind === "case" || result?.kind === "combo" ? result : undefined;
}
