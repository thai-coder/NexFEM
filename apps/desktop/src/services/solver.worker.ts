/** Dedicated Web Worker for the linear-static solver (Phase 5, Group A). */
interface SolverExports {
  memory: WebAssembly.Memory;
  alloc(n: number): number;
  dealloc(p: number, n: number): void;
  analyze(p: number, n: number): number;
  result_ptr(): number;
}

interface SolverRequest {
  wasmUrl: string;
  modelJson: string;
}

let wasm: Promise<SolverExports> | null = null;

function getSolver(url: string): Promise<SolverExports> {
  wasm ??= (async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Không tải được bộ giải (${response.status})`);
    const result = await WebAssembly.instantiate(await response.arrayBuffer(), {});
    return result.instance.exports as unknown as SolverExports;
  })();
  return wasm;
}

self.onmessage = async (event: MessageEvent<SolverRequest>) => {
  try {
    const solver = await getSolver(event.data.wasmUrl);
    const bytes = new TextEncoder().encode(event.data.modelJson);
    const ptr = solver.alloc(bytes.length);
    let length: number;
    try {
      new Uint8Array(solver.memory.buffer, ptr, bytes.length).set(bytes);
      length = solver.analyze(ptr, bytes.length);
    } finally {
      solver.dealloc(ptr, bytes.length);
    }
    // Copy output before the next WASM call can reuse its buffer.
    const output = new Uint8Array(solver.memory.buffer, solver.result_ptr(), length).slice();
    self.postMessage(JSON.parse(new TextDecoder().decode(output)));
  } catch (err) {
    self.postMessage({
      ok: false,
      error: {
        code: "solver_worker_failed",
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
};

export {};
