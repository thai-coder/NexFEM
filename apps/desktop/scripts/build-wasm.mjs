// Biên dịch bộ giải Rust (crates/fem-wasm) sang WebAssembly và chép vào public/fem.wasm.
// Bỏ qua bằng NEXFEM_SKIP_WASM=1 (khi đã có sẵn file).
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = fileURLToPath(new URL("../public/fem.wasm", import.meta.url));
if (process.env.NEXFEM_SKIP_WASM && existsSync(out)) process.exit(0);
const r = spawnSync("cargo", ["build", "-p", "fem-wasm", "--target", "wasm32-unknown-unknown", "--release"], { cwd: root, stdio: "inherit" });
if (r.status !== 0) {
  console.error("Không build được fem-wasm. Cần: rustup target add wasm32-unknown-unknown");
  process.exit(r.status ?? 1);
}
mkdirSync(fileURLToPath(new URL("../public/", import.meta.url)), { recursive: true });
const src = `${root}target/wasm32-unknown-unknown/release/fem_wasm.wasm`;
copyFileSync(src, out);
console.log(`fem.wasm: ${(statSync(out).size / 1024).toFixed(0)} KB`);
