// Chạy trong CI cho pull request: đọc file thay đổi và các PR đang mở bằng `gh`, ghi gợi ý vào job summary.
// Chỉ ghi summary, không bình luận hay gắn nhãn (không làm phiền người khác); cảnh báo không chặn merge.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { overlaps, route } from "./route.mjs";

const pr = process.env.PR_NUMBER;
if (!pr) {
  console.log("Không có PR_NUMBER: bỏ qua.");
  process.exit(0);
}
const gh = (...args) => JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));
const mine = gh("pr", "view", pr, "--json", "files").files.map((f) => f.path);
const r = route(mine);
const others = gh("pr", "list", "--state", "open", "--json", "number,title,files", "--limit", "50")
  .filter((o) => String(o.number) !== String(pr))
  .map((o) => ({ number: o.number, title: o.title, files: o.files.map((f) => f.path) }));
const o = overlaps(mine, others);

const TIER = { deep: "mạnh nhất, mức suy nghĩ cao", standard: "tầm trung", light: "nhẹ" };
const lines = [
  `## Gợi ý phân việc cho PR #${pr}`,
  "",
  `- Vùng: ${r.areas.join(", ") || "—"} · nguy cơ **${r.risk}** · mô hình gợi ý: **${TIER[r.tier]}**`,
  ...r.reasons.map((x) => `- Lý do: ${x}`),
  `- Review chéo bởi tác tử khác: **${r.crossReview ? "cần" : "không bắt buộc"}**`,
  `- Khoá schema (một PR một lúc): **${r.schemaLock ? "có" : "không"}**`,
  `- Nghiệm thu thủ công trên Windows: **${r.windowsAcceptance ? "cần" : "không"}**`,
  ...(r.unmatched.length ? [`- File chưa có trong bảng định tuyến: ${r.unmatched.slice(0, 10).join(", ")}`] : []),
  "",
  o.length ? "### PR đang mở đụng cùng file hoặc cùng schema" : "Không có PR đang mở nào đụng cùng file hoặc cùng schema.",
  ...o.map((x) => `- #${x.pr} ${x.title}${x.schemaLock ? " — **cùng hợp đồng dữ liệu, cần thống nhất thứ tự**" : ""}${x.sharedFiles.length ? ` — chung: ${x.sharedFiles.join(", ")}` : ""}`),
];
const text = lines.join("\n") + "\n";
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
