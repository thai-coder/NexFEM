// Đặt số phiên bản cho một bản build: MAJOR.MINOR lấy từ file VERSION, PATCH là số lần chạy CI.
//   node scripts/set-version.mjs --build <số>     → 0.1.<số>   (CI: số = github.run_number)
//   node scripts/set-version.mjs 1.2.3             → đặt thẳng
// Ghi vào tauri.conf.json và Cargo.toml (workspace) để file cài, file .exe, MSI, "Giới thiệu" cùng một phiên bản.
// Nếu có $GITHUB_ENV thì xuất NEXFEM_VERSION cho các bước sau.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
let version;
if (args[0] === "--build") {
  const base = readFileSync(`${root}VERSION`, "utf8").trim();
  const n = Number(args[1]);
  if (!/^\d+\.\d+$/.test(base) || !Number.isInteger(n) || n < 0 || n > 65535) {
    console.error(`VERSION phải dạng MAJOR.MINOR và số build 0–65535 (nhận: "${base}", "${args[1]}")`);
    process.exit(1);
  }
  version = `${base}.${n}`;
} else if (/^\d+\.\d+\.\d+$/.test(args[0] ?? "")) {
  version = args[0];
} else {
  console.error("Cách dùng: set-version.mjs --build <số> | <MAJOR.MINOR.PATCH>");
  process.exit(1);
}

const conf = `${root}apps/desktop/src-tauri/tauri.conf.json`;
const c = JSON.parse(readFileSync(conf, "utf8"));
c.version = version;
writeFileSync(conf, JSON.stringify(c, null, 2) + "\n");

const cargo = `${root}Cargo.toml`;
let t = readFileSync(cargo, "utf8");
const next = t.replace(/(\[workspace\.package\][^\[]*?\nversion\s*=\s*)"[^"]*"/s, `$1"${version}"`);
if (next === t && !t.includes(`version = "${version}"`)) throw new Error("Không tìm thấy version trong [workspace.package] của Cargo.toml");
writeFileSync(cargo, next);

if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `NEXFEM_VERSION=${version}\n`);
console.log(version);
