import type { Model } from "@nexfem/model-core";

/** Kết quả phân tích (khớp với crates/fem-solver/src/analysis.rs). Đơn vị kN, m. */
export interface FrameForces {
  x: number[];
  p: number[];
  v2: number[];
  v3: number[];
  t: number[];
  m2: number[];
  m3: number[];
}

export interface CaseResult {
  id: string;
  name: string;
  kind: "case" | "combo";
  displacements: Record<string, number[]>;
  reactions: Record<string, number[]>;
  frames: Record<string, FrameForces>;
  applied: number[];
  sumReactions: number[];
}

export interface SolverMessage {
  code: string;
  message: string;
  objects?: string[];
}

export interface Results {
  dof: number;
  joints: number;
  frames: number;
  profile: number;
  cases: CaseResult[];
  warnings: SolverMessage[];
}

export type SolveOutput = { ok: true; results: Results } | { ok: false; error: SolverMessage };

/** Chạy solver trong worker riêng; WebAssembly không chiếm main thread/WebView2. */
export async function solve(model: Model): Promise<SolveOutput> {
  return new Promise<SolveOutput>((resolve, reject) => {
    const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<SolveOutput>) => {
      cleanup();
      resolve(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message || "Solver worker failed"));
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error("Solver worker message could not be decoded"));
    };
    try {
      worker.postMessage({
        wasmUrl: new URL("fem.wasm", document.baseURI).href,
        modelJson: JSON.stringify(model),
      });
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}
