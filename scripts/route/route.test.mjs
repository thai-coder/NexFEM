import assert from "node:assert/strict";
import { test } from "node:test";
import { areaOf, overlaps, route } from "./route.mjs";

test("khớp quy tắc dài nhất: schema.ts là hợp đồng, phần còn lại của model-core là lõi", () => {
  assert.equal(areaOf("packages/model-core/src/schema.ts").id, "contract");
  assert.equal(areaOf("packages/model-core/src/commands.ts").id, "model-core");
  assert.equal(areaOf("apps/desktop/src/i18n/vi.ts").id, "i18n");
  assert.equal(areaOf("apps/desktop/src/App.tsx").id, "ui");
  assert.equal(areaOf("apps/desktop/src-tauri/tauri.conf.json").id, "installer");
  assert.equal(areaOf("không/có/quy/tắc.txt"), null);
});

test("chỉ tài liệu hoặc chuỗi giao diện: mô hình nhẹ, không cần review chéo", () => {
  const r = route(["docs/csi-import.md", "apps/desktop/src/i18n/en.ts"]);
  assert.deepEqual([r.risk, r.tier, r.crossReview, r.schemaLock], ["low", "light", false, false]);
});

test("giao diện theo mẫu có sẵn: mô hình tầm trung", () => {
  const r = route(["apps/desktop/src/panels/properties/Properties.tsx", "tests/e2e/specs/ui2.spec.ts"]);
  assert.deepEqual([r.risk, r.tier], ["medium", "standard"]);
});

test("bộ giải hoặc nhập CSI: nguy cơ cao, mô hình mạnh, review chéo", () => {
  for (const f of ["crates/fem-solver/src/analysis.rs", "packages/io-formats/src/csi/e2k-import.ts"]) {
    const r = route([f]);
    assert.deepEqual([r.risk, r.tier, r.crossReview], ["high", "deep", true]);
  }
});

test("đụng schema cùng thứ khác: khoá schema, cắt ngang nhiều lớp", () => {
  const r = route(["packages/model-core/src/schema.ts", "crates/fem-core/src/model.rs", "apps/desktop/src/App.tsx"]);
  assert.equal(r.schemaLock, true);
  assert.equal(r.crossCutting, true);
  assert.equal(r.tier, "deep");
  assert.ok(r.reasons.length >= 2);
});

test("bộ cài cần nghiệm thu Windows; file lạ được liệt kê", () => {
  const r = route(["apps/desktop/src-tauri/installer/installer.nsi", "tools/lạ.txt"]);
  assert.equal(r.windowsAcceptance, true);
  assert.deepEqual(r.unmatched, ["tools/lạ.txt"]);
});

test("phát hiện PR khác đụng cùng file hoặc cùng hợp đồng dữ liệu", () => {
  const mine = ["packages/model-core/src/schema.ts", "docs/a.md"];
  const others = [
    { number: 7, title: "khác file schema", files: ["crates/fem-core/src/model.rs"] },
    { number: 8, title: "cùng file docs", files: ["docs/a.md", "docs/b.md"] },
    { number: 9, title: "không liên quan", files: ["tests/e2e/specs/x.ts"] },
  ];
  const o = overlaps(mine, others);
  assert.deepEqual(o.map((x) => [x.pr, x.schemaLock]), [[7, true], [8, false]]);
  assert.deepEqual(o[1].sharedFiles, ["docs/a.md"]);
});
