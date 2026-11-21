/**
 * Bộ đối chiếu M2 (giải tích): file CSI `.s2k` → `importS2k` → mô hình NexFEM → bộ giải Rust → so với nghiệm đóng.
 *
 * Phạm vi: chứng minh đường nhập + bộ giải khớp lý thuyết trong dung sai ghi theo từng chỉ số
 * (tests/benchmarks/csi/cases/*.reference.json). KHÔNG phải đối chiếu với ETABS/SAP2000: các file đầu vào là tổng hợp
 * và giá trị chuẩn là công thức. Ca cần kết quả CSI thật nằm ở tests/benchmarks/csi/manifest.json (reference-results-pending).
 *
 * Đặt CSI_BENCH_REPORT=<đường dẫn .md> để ghi báo cáo đối chiếu.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { decodeE2k, importS2k } from "../src/index.ts";
// @ts-expect-error: tập lệnh .mjs không có kiểu
import { compareNormalized } from "../../../scripts/validation/compare-csi.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const casesDir = `${root}tests/benchmarks/csi/cases/`;

interface Metric { case: string; kind: string; object: string; component: string; value: number; absTolerance?: number; absTol?: number; relTolerance?: number; relTol?: number }
interface Reference {
  id: string; description: string; file: string; basis: string; classification: string; limitations: string[];
  source: { program: string; version: string }; units: Record<string, string>; metrics: Metric[];
}
interface Comparison { totals: Record<string, number>; passed: boolean; rows: Array<{ key: string; status: string; reference?: number; actual?: number; absError?: number; relativeError?: number | null; allowed?: number }> }

const DOF = ["U1", "U2", "U3", "R1", "R2", "R3"];
const FORCE = ["F1", "F2", "F3", "M1", "M2", "M3"];

let solverChecked = false;
function solve(modelJson: string) {
  const p = spawnSync("cargo", ["run", "-q", "--release", "-p", "fem-solver", "--example", "solve"], { cwd: root, input: modelJson, encoding: "utf8", maxBuffer: 64 << 20 });
  if (p.status !== 0) throw new Error(`bộ giải lỗi: ${p.stderr}`);
  solverChecked = true;
  return JSON.parse(p.stdout) as { ok: boolean; results?: any; error?: unknown };
}

/** Giá trị theo `object`: nhãn nút, `mean(a,b)`, `sum(a,b)` hoặc `nhãnThanh@x=giá_trị`. */
function observe(ref: Reference, model: ReturnType<typeof importS2k>["model"], results: any): { units: Record<string, string>; metrics: Metric[] } {
  const jointId = (label: string) => {
    const j = model.joints.find((x) => x.label === label);
    if (!j) throw new Error(`không có nút ${label}`);
    return j.id;
  };
  const caseResult = (name: string) => {
    const c = results.cases.find((x: any) => x.name === name);
    if (!c) throw new Error(`không có ca tải ${name}`);
    return c;
  };
  const metrics = ref.metrics.map((r) => {
    const c = caseResult(r.case);
    let value: number;
    if (r.kind === "frameForce") {
      const [label, xs] = r.object.split("@x=");
      const fr = model.frames.find((f) => f.label === label);
      if (!fr) throw new Error(`không có thanh ${label}`);
      const f = c.frames[fr.id];
      const x = Number(xs);
      const k = f.x.findIndex((s: number) => Math.abs(s - x) < 1e-9);
      if (k < 0) throw new Error(`không có trạm x = ${x} trên thanh ${label}`);
      value = f[r.component.toLowerCase()][k];
    } else {
      const table = r.kind === "displacement" ? c.displacements : c.reactions;
      const names = r.kind === "displacement" ? DOF : FORCE;
      const idx = names.indexOf(r.component);
      const fn = /^(mean|sum)\((.+)\)$/.exec(r.object);
      const labels = fn ? fn[2]!.split(",") : [r.object];
      const vals = labels.map((l) => (table[jointId(l)] ?? [0, 0, 0, 0, 0, 0])[idx] as number);
      const s = vals.reduce((a, b) => a + b, 0);
      value = fn?.[1] === "mean" ? s / vals.length : s;
    }
    return { case: r.case, kind: r.kind, object: r.object, component: r.component, value };
  });
  return { units: ref.units, metrics };
}

const refs: Reference[] = readdirSync(casesDir).filter((f) => f.endsWith(".reference.json")).sort()
  .map((f) => JSON.parse(readFileSync(casesDir + f, "utf8")));
const done: Array<{ ref: Reference; cmp: Comparison; equilibrium: number }> = [];

describe("đối chiếu giải tích: nhập .s2k → bộ giải", () => {
  // Biên dịch bộ giải một lần (lần đầu trên CI có thể mất vài chục giây), để từng ca không vượt thời gian chờ.
  beforeAll(() => {
    const p = spawnSync("cargo", ["build", "-q", "--release", "-p", "fem-solver", "--example", "solve"], { cwd: root, encoding: "utf8" });
    if (p.status !== 0) throw new Error(`không biên dịch được bộ giải: ${p.stderr}`);
  }, 600_000);

  it("có ít nhất 5 ca", () => expect(refs.length).toBeGreaterThanOrEqual(5));

  for (const ref of refs) {
    it(`${ref.id}`, () => {
      const { model, report } = importS2k(decodeE2k(readFileSync(casesDir + ref.file)));
      // Không được mất dữ liệu âm thầm: mọi lỗi/cảnh báo nhập đều làm ca hỏng.
      const issues = report.diagnostics.filter((d) => d.level !== "info");
      expect(issues, JSON.stringify(issues)).toEqual([]);
      const out = solve(JSON.stringify(model));
      expect(out.ok, JSON.stringify(out.error)).toBe(true);
      const results = out.results;
      expect(results.warnings, "bộ giải không được cảnh báo").toEqual([]);
      const reference = { ...ref, metrics: ref.metrics.map((m) => ({ ...m, absTolerance: m.absTol, relTolerance: m.relTol })) };
      const cmp = compareNormalized(reference, observe(ref, model, results)) as Comparison;
      const failing = cmp.rows.filter((r) => r.status !== "pass");
      expect(failing, JSON.stringify(failing, null, 1)).toEqual([]);
      expect(cmp.passed).toBe(true);
      // Cân bằng tổng thể: tải đặt vào = −phản lực (đo độc lập với nghiệm đóng).
      const c = results.cases[0];
      const eq = Math.max(...[0, 1, 2].map((i) => Math.abs(c.applied[i] + c.sumReactions[i])));
      expect(eq).toBeLessThan(1e-8);
      done.push({ ref, cmp, equilibrium: eq });
    });
  }

  it("ghi báo cáo (khi đặt CSI_BENCH_REPORT)", () => {
    expect(solverChecked).toBe(true);
    const target = process.env.CSI_BENCH_REPORT;
    if (!target) return;
    writeFileSync(target, renderReport(done));
  });
});

function renderReport(rows: typeof done): string {
  const f = (v: number | undefined | null) => (v === undefined || v === null ? "—" : Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(3) : String(Number(v.toPrecision(7))));
  let md = `# Báo cáo đối chiếu giải tích — nhập file CSI → bộ giải NexFEM\n\n`;
  md += `Sinh tự động bởi \`packages/io-formats/test/csi-benchmarks.test.ts\` (đặt \`CSI_BENCH_REPORT\`). Đừng sửa tay.\n\n`;
  md += `> **Phạm vi.** Đây là đối chiếu với **nghiệm đóng (giải tích)**, không phải với kết quả ETABS/SAP2000. File \`.s2k\` đầu vào là tổng hợp, ` +
    `dựng theo tên bảng/trường của file SAP2000 thật. Ca đạt chỉ chứng minh đường nhập + bộ giải khớp lý thuyết trong dung sai ghi dưới đây; ` +
    `không chứng minh tương đương CSI (xem \`tests/benchmarks/csi/manifest.json\`: kết quả CSI thật vẫn *pending*).\n\n`;
  md += `## Ma trận độ phủ\n\n| Ca | Phân loại | Chỉ số | Đạt | Cân bằng tải−phản lực |\n|---|---|---|---|---|\n`;
  for (const { ref, cmp, equilibrium } of rows) {
    md += `| \`${ref.id}\` | ${ref.classification} | ${cmp.totals.pass}/${ref.metrics.length} | ${cmp.passed ? "✔" : "✘"} | ${equilibrium.toExponential(1)} |\n`;
  }
  md += `\n\`analytic-exact\`: nghiệm đóng đúng cho phần tử dầm Euler–Bernoulli (sai số chỉ là làm tròn; dung sai tương đối 1e-6). ` +
    `\`analytic-approximate\`: công thức bỏ qua một hiệu ứng mà mô hình NexFEM có kể; dung sai nới theo chặn trên của hiệu ứng đó.\n\n`;
  md += `## Chưa so sánh được (\`not comparable\`)\n\n` +
    `- Kết quả ETABS/SAP2000 thật (chuyển vị, phản lực, nội lực): chưa có bảng xuất độc lập → chặn.\n` +
    `- Dấu quy ước nội lực của CSI (V2, M3 theo từng chương trình): chưa đối chiếu; ở đây chỉ kiểm tra quy ước NexFEM (M3 > 0 căng thớ dưới).\n` +
    `- Sàn/vách (shell), diaphragm cứng, P-Delta, dao động, biến dạng cắt, offset đầu thanh: bộ giải hiện tại không có → không so sánh, không đánh dấu đạt.\n` +
    `- Đường nhập \`.e2k\`: chưa có ca giải tích ETABS ở bộ này (cú pháp \`POINTASSIGN RESTRAINT\` chưa có trong file ETABS thật).\n\n`;
  for (const { ref, cmp } of rows) {
    md += `## ${ref.id}\n\n${ref.description}\n\n- Cơ sở: ${ref.basis}\n`;
    for (const l of ref.limitations) md += `- Giới hạn: ${l}\n`;
    md += `\n| Chỉ số | Chuẩn | NexFEM | Sai số tuyệt đối | Sai số tương đối | Cho phép | |\n|---|---|---|---|---|---|---|\n`;
    for (const r of cmp.rows) {
      md += `| ${r.key.split("|").slice(1).join(" · ")} | ${f(r.reference)} | ${f(r.actual)} | ${f(r.absError)} | ${r.relativeError == null ? "—" : r.relativeError.toExponential(1)} | ${f(r.allowed)} | ${r.status === "pass" ? "✔" : "✘ " + r.status} |\n`;
    }
    md += "\n";
  }
  return md;
}
