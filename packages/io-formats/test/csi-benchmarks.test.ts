/**
 * Bộ đối chiếu M2 (giải tích): file CSI `.s2k` → `importS2k` → mô hình NexFEM → bộ giải Rust → so với nghiệm đóng.
 *
 * Phạm vi: chứng minh đường nhập + bộ giải khớp lý thuyết trong dung sai ghi theo từng chỉ số
 * (tests/benchmarks/csi/cases/*.reference.json). KHÔNG phải đối chiếu với ETABS/SAP2000: các file đầu vào là tổng hợp
 * và giá trị chuẩn là công thức. Ca cần kết quả CSI thật nằm ở tests/benchmarks/csi/manifest.json (reference-results-pending).
 *
 * Bộ published dùng mô hình .json dựng từ PDF CSI và đối chiếu với bảng số liệu công bố.
 * Đặt CSI_BENCH_REPORT=<đường dẫn .md> để ghi báo cáo giải tích.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { checkModel, parseProject, type Model } from "@nexfem/model-core";
import { decodeE2k, importS2k } from "../src/index.ts";
// @ts-expect-error: tập lệnh .mjs không có kiểu
import { compareNormalized } from "../../../scripts/validation/compare-csi.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const casesDir = `${root}tests/benchmarks/csi/cases/`;
const publishedDir = `${root}tests/benchmarks/csi/published/`;

interface Metric { case: string; kind: string; object: string; component: string; value: number; absTolerance?: number; absTol?: number; relTolerance?: number; relTol?: number }
interface Reference {
  id: string; description: string; file: string; basis: string; classification: string; limitations: string[];
  source: { program: string; version: string }; units: Record<string, string>; metrics: Metric[];
}
interface Comparison { totals: Record<string, number>; passed: boolean; rows: Array<{ key: string; status: string; reference?: number; actual?: number; absError?: number; relativeError?: number | null; allowed?: number }> }
type FrameResults = Record<string, number[]> & { x: number[] };
interface CaseResults {
  name: string;
  frames: Record<string, FrameResults>;
  displacements: Record<string, number[]>;
  reactions: Record<string, number[]>;
  applied: [number, number, number];
  sumReactions: [number, number, number];
}
interface SolverResults { cases: CaseResults[]; warnings: unknown[] }
type SolverResponse = { ok: true; results: SolverResults } | { ok: false; error: unknown };

const DOF = ["U1", "U2", "U3", "R1", "R2", "R3"];
const FORCE = ["F1", "F2", "F3", "M1", "M2", "M3"];

const BUILD_TIMEOUT = 180_000;

function buildSolver(): string {
  const build = spawnSync(
    "cargo", ["build", "--locked", "--release", "-p", "fem-solver", "--example", "solve", "--message-format=json-render-diagnostics"],
    { cwd: root, encoding: "utf8", timeout: BUILD_TIMEOUT, maxBuffer: 16 << 20 },
  );
  if (build.error) throw build.error;
  if (build.status !== 0) throw new Error(`Không biên dịch được bộ giải:\n${build.stderr}`);
  for (const line of build.stdout.trim().split("\n")) {
    const artifact = JSON.parse(line);
    if (artifact.reason === "compiler-artifact" && artifact.target.name === "solve" &&
        artifact.target.kind.includes("example") && typeof artifact.executable === "string") {
      return artifact.executable;
    }
  }
  throw new Error("Cargo không trả về đường dẫn chương trình solve");
}

function solve(executable: string, modelJson: string): SolverResponse {
  const run = spawnSync(executable, [], { cwd: root, input: modelJson, encoding: "utf8", timeout: 4_000, maxBuffer: 16 << 20 });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`Bộ giải lỗi:\n${run.stderr}`);
  return JSON.parse(run.stdout) as SolverResponse;
}

function caseResult(results: SolverResults, name: string): CaseResults {
  const result = results.cases.find((c) => c.name === name);
  if (!result) throw new Error(`Không có kết quả cho ca tải ${name}`);
  return result;
}

/** Giá trị theo `object`: nhãn nút, `mean(a,b)`, `sum(a,b)` hoặc `nhãnThanh@x=giá_trị`. */
function observe(ref: Reference, model: Model, results: SolverResults): { units: Record<string, string>; metrics: Metric[] } {
  const jointId = (label: string) => {
    const j = model.joints.find((x) => x.label === label);
    if (!j) throw new Error(`không có nút ${label}`);
    return j.id;
  };
  const metrics = ref.metrics.map((r) => {
    const c = caseResult(results, r.case);
    let value: number;
    if (r.kind === "frameForce") {
      const [label, xs] = r.object.split("@x=");
      const fr = model.frames.find((f) => f.label === label);
      if (!fr) throw new Error(`không có thanh ${label}`);
      const f = c.frames[fr.id];
      if (!f) throw new Error(`Không có nội lực thanh ${label} trong ca ${r.case}`);
      const x = Number(xs);
      const k = f.x.findIndex((s) => Math.abs(s - x) < 1e-9);
      if (k < 0) throw new Error(`không có trạm x = ${x} trên thanh ${label}`);
      const component = f[r.component.toLowerCase()]?.[k];
      if (component === undefined) throw new Error(`Thiếu ${r.component} tại trạm ${r.object} trong ca ${r.case}`);
      value = component;
    } else {
      if (r.kind !== "displacement" && r.kind !== "reaction") throw new Error(`Loại kết quả không hợp lệ ${r.kind}`);
      const table = r.kind === "displacement" ? c.displacements : c.reactions;
      const names = r.kind === "displacement" ? DOF : FORCE;
      const idx = names.indexOf(r.component);
      const fn = /^(mean|sum)\((.+)\)$/.exec(r.object);
      const labels = fn ? fn[2]!.split(",") : [r.object];
      const vals = labels.map((label) => {
        const component = table[jointId(label)]?.[idx];
        if (component === undefined) throw new Error(`Thiếu ${r.component} tại nút ${label} trong ca ${r.case}`);
        return component;
      });
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

let solver: string;
beforeAll(() => {
  solver = buildSolver();
}, BUILD_TIMEOUT + 5_000);

function checkBenchmark(ref: Reference, model: Model) {
  const out = solve(solver, JSON.stringify(model));
  if (!out.ok) throw new Error(`Không giải được ${ref.id}: ${JSON.stringify(out.error)}`);
  const results = out.results;
  expect(results.warnings, "bộ giải không được cảnh báo").toEqual([]);
  const cmp = compareNormalized(ref, observe(ref, model, results)) as Comparison;
  const failing = cmp.rows.filter((r) => r.status !== "pass");
  expect(failing, JSON.stringify(failing, null, 1)).toEqual([]);
  expect(cmp.passed).toBe(true);

  const caseNames = new Set(ref.metrics.map((m) => m.case));
  const equilibrium = Math.max(...Array.from(caseNames, (name) => {
    const c = caseResult(results, name);
    return Math.max(...([0, 1, 2] as const).map((i) => Math.abs(c.applied[i] + c.sumReactions[i])));
  }));
  expect(equilibrium).toBeLessThan(1e-8);
  return { ref, cmp, equilibrium };
}

describe("đối chiếu giải tích: nhập .s2k → bộ giải", () => {
  it("có ít nhất 5 ca", () => expect(refs.length).toBeGreaterThanOrEqual(5));

  for (const ref of refs) {
    it(`${ref.id}`, () => {
      const { model, report } = importS2k(decodeE2k(readFileSync(casesDir + ref.file)));
      // Không được mất dữ liệu âm thầm: mọi lỗi/cảnh báo nhập đều làm ca hỏng.
      const issues = report.diagnostics.filter((d) => d.level !== "info");
      expect(issues, JSON.stringify(issues)).toEqual([]);
      const reference = { ...ref, metrics: ref.metrics.map((m) => ({ ...m, absTolerance: m.absTol, relTolerance: m.relTol })) };
      done.push(checkBenchmark(reference, model));
    });
  }

  it("ghi báo cáo (khi đặt CSI_BENCH_REPORT)", () => {
    const target = process.env.CSI_BENCH_REPORT;
    if (!target) return;
    expect(done).toHaveLength(refs.length);
    writeFileSync(target, renderReport(done));
  });
});

describe("đối chiếu bảng công bố CSI: mô hình dựng lại → bộ giải", () => {
  it.each(["ExampleEtabs 01", "ExampleSAP2000 01"])("%s", (name) => {
    const ref: Reference = JSON.parse(readFileSync(`${publishedDir}${name}.reference.json`, "utf8"));
    const { model } = parseProject(readFileSync(publishedDir + ref.file));
    const errors = checkModel(model).filter((message) => message.level === "error");
    expect(errors, JSON.stringify(errors)).toEqual([]);
    checkBenchmark(ref, model);
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
    `- Quy ước dấu nội lực CSI còn chờ đối chiếu. Ca công xôn kiểm tra M2 và M3 theo trục địa phương của NexFEM.\n` +
    `- Sàn/vách (shell), diaphragm cứng, P-Delta, dao động và offset đầu thanh nằm ngoài phạm vi bộ benchmark này.\n` +
    `- NexFEM tính biến dạng cắt khi tiết diện có \`shearAreas\`. Các ca ở đây dùng dầm Euler–Bernoulli; khi so với CSI, cần đối chiếu diện tích chịu cắt AS2/AS3 trước khi đặt dung sai chuyển vị.\n` +
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
