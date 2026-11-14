// Đặt số phiên bản cho một bản build theo quy tắc X.Y.Z (scripts/version-rule.mjs, docs/versioning.md).
//   node scripts/set-version.mjs --build <số> [--date <ISO>]  → X.Y.<số>, X.Y tính từ ngày (mặc định: bây giờ, UTC)
//   node scripts/set-version.mjs 1.2.3                         → đặt thẳng
// Ghi vào tauri.conf.json và Cargo.toml (workspace) để file cài, file .exe, MSI, "Giới thiệu" cùng một phiên bản.
// Nếu có $GITHUB_ENV thì xuất NEXFEM_VERSION cho các bước sau.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { versionFor, Z_WARN } from "./version-rule.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
let version;
if (args[0] === "--build") {
  const n = Number(args[1]);
  const at = args.indexOf("--date");
  const date = at > 0 ? new Date(args[at + 1]) : new Date();
  try {
    version = versionFor(date, n);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  // Còn xa giới hạn 65535 của MSI, nhưng báo sớm để kịp chốt cách xử lý (docs/versioning.md).
  if (n > Z_WARN) console.log(`::warning::Số build Z = ${n} đã vượt ${Z_WARN}; giới hạn của MSI là 65535 (xem docs/versioning.md)`);
} else if (/^\d+\.\d+\.\d+$/.test(args[0] ?? "")) {
  version = args[0];
} else {
  console.error("Cách dùng: set-version.mjs --build <số> [--date <ISO>] | <X.Y.Z>");
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
