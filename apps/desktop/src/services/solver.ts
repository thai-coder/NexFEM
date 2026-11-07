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

interface SolverExports {
  memory: WebAssembly.Memory;
  alloc(n: number): number;
  dealloc(p: number, n: number): void;
  analyze(p: number, n: number): number;
  result_ptr(): number;
}

let instance: Promise<SolverExports> | null = null;

/** Nạp bộ giải WebAssembly (một lần). Dùng chung cho bản desktop và bản trình duyệt. */
function solver(): Promise<SolverExports> {
  instance ??= (async () => {
    const url = new URL("fem.wasm", document.baseURI);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Không tải được bộ giải (${res.status})`);
    const { instance: inst } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
    return inst.exports as unknown as SolverExports;
  })();
  instance.catch(() => (instance = null));
  return instance;
}

/** Phân tích tĩnh tuyến tính. */
export async function solve(model: Model): Promise<SolveOutput> {
  const s = await solver();
  const input = new TextEncoder().encode(JSON.stringify(model));
  const ptr = s.alloc(input.length);
  new Uint8Array(s.memory.buffer, ptr, input.length).set(input);
  const len = s.analyze(ptr, input.length);
  s.dealloc(ptr, input.length);
  const out = new Uint8Array(s.memory.buffer, s.result_ptr(), len);
  return JSON.parse(new TextDecoder().decode(out)) as SolveOutput;
}
