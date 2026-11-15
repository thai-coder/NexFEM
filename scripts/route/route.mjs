// Định tuyến công việc theo các file thay đổi (docs/WORK_ROUTING.md).
//   node scripts/route/route.mjs <file>...        → JSON gợi ý
//   git diff --name-only origin/main... | node scripts/route/route.mjs --stdin
// Chỉ gợi ý và cảnh báo, không chặn merge; quyết định thuộc chủ dự án.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const config = JSON.parse(readFileSync(fileURLToPath(new URL("./routing.json", import.meta.url)), "utf8"));
const RISK = { low: 0, medium: 1, high: 2 };

/** Quy tắc khớp dài nhất cho một đường dẫn; null nếu không khớp. */
export function areaOf(path, areas = config.areas) {
  let best = null;
  let bestLen = -1;
  for (const a of areas) for (const p of a.paths) if (path.startsWith(p) && p.length > bestLen) [best, bestLen] = [a, p.length];
  return best;
}

/** Gợi ý cho một tập file thay đổi. */
export function route(files, areas = config.areas) {
  const hit = new Map();
  const unmatched = [];
  for (const f of files) {
    const a = areaOf(f, areas);
    if (a) hit.set(a.id, a);
    else unmatched.push(f);
  }
  const list = [...hit.values()];
  const risk = list.reduce((r, a) => (RISK[a.risk] > RISK[r] ? a.risk : r), "low");
  const high = list.filter((a) => a.risk === "high").length;
  // Hai vùng nguy cơ cao trở lên, hoặc đụng schema cùng thứ khác: cắt ngang nhiều lớp → mô hình mạnh.
  const crossCutting = high >= 2 || (hit.has("contract") && list.length > 1);
  const tier = risk === "high" || crossCutting ? "deep" : risk === "medium" ? "standard" : "light";
  return {
    areas: list.map((a) => a.id),
    unmatched,
    risk,
    tier,
    crossCutting,
    schemaLock: list.some((a) => a.lock),
    crossReview: list.some((a) => a.crossReview),
    windowsAcceptance: list.some((a) => a.windows),
    reasons: [
      ...(risk === "high" ? ["đụng vùng nguy cơ cao: " + list.filter((a) => a.risk === "high").map((a) => a.label).join(", ")] : []),
      ...(crossCutting ? ["thay đổi cắt ngang nhiều lớp"] : []),
    ],
  };
}

/** Các PR đang mở đụng cùng file "khoá" (hợp đồng dữ liệu) hoặc cùng vùng nguy cơ cao với PR này. */
export function overlaps(mine, others, areas = config.areas) {
  const mineFiles = new Set(mine);
  const out = [];
  for (const o of others) {
    const shared = o.files.filter((f) => mineFiles.has(f));
    const lockHit = o.files.some((f) => areaOf(f, areas)?.lock) && mine.some((f) => areaOf(f, areas)?.lock);
    if (shared.length || lockHit) out.push({ pr: o.number, title: o.title, sharedFiles: shared.slice(0, 10), schemaLock: lockHit });
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const files = args[0] === "--stdin" ? readFileSync(0, "utf8").split(/\r?\n/).filter(Boolean) : args;
  console.log(JSON.stringify(route(files), null, 2));
}
