import assert from "node:assert/strict";
import { test } from "node:test";
import { versionFor } from "./version-rule.mjs";

const d = (s) => new Date(s);

test("các mốc trong quy tắc của chủ dự án", () => {
  assert.equal(versionFor(d("2026-11-14T10:00:00Z"), 153), "0.1.153");
  assert.equal(versionFor(d("2026-12-01T00:00:00Z"), 400), "0.2.400");
  assert.equal(versionFor(d("2027-01-15T12:00:00Z"), 401), "1.3.401");
  assert.equal(versionFor(d("2027-10-31T23:59:59Z"), 9000), "1.12.9000");
  assert.equal(versionFor(d("2028-01-01T00:00:00Z"), 9001), "2.15.9001");
});

test("ranh giới tháng tính theo UTC", () => {
  assert.equal(versionFor(d("2026-11-30T23:59:59Z"), 1), "0.1.1");
  assert.equal(versionFor(d("2026-12-01T00:00:00Z"), 1), "0.2.1");
});

test("ngoài phạm vi và giới hạn MSI thì báo lỗi", () => {
  assert.throws(() => versionFor(d("2026-10-31T00:00:00Z"), 1), /11\/2026/);
  assert.throws(() => versionFor(d("2026-11-14T00:00:00Z"), 65536), /65535/);
  assert.throws(() => versionFor(d("2026-11-14T00:00:00Z"), -1), /65535/);
  assert.throws(() => versionFor(d("2048-02-01T00:00:00Z"), 1), /255/);
  assert.equal(versionFor(d("2048-01-31T00:00:00Z"), 1), "22.255.1");
});
