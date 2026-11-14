import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { en } from "../i18n/en.ts";
import { vi } from "../i18n/vi.ts";

/** Mọi mã thông báo bộ nhập .e2k / .s2k phát ra đều có câu tiếng Việt và tiếng Anh. */
describe("chuỗi giao diện cho báo cáo nhập ETABS / SAP2000", () => {
  const src = ["e2k-import.ts", "s2k-import.ts", "detect.ts"].map((f) => readFileSync(fileURLToPath(new URL(`../../../../packages/io-formats/src/csi/${f}`, import.meta.url)), "utf8")).join("\n");
  const codes = new Set([...src.matchAll(/"([a-z][a-z0-9]*(?:_[a-z0-9]+)+|program)"/g)].map((m) => m[1]!).filter((c) => !c.includes("__")));
  // Bỏ các chuỗi không phải mã thông báo.
  for (const notCode of ["shell_thin"]) codes.delete(notCode);
  it("có đủ bản dịch", () => {
    const missingVi = [...codes].filter((c) => !(c in vi.csi.codes));
    const missingEn = [...codes].filter((c) => !(c in en.csi.codes));
    expect(missingVi).toEqual([]);
    expect(missingEn).toEqual([]);
    expect(codes.size).toBeGreaterThan(70);
    expect(codes.has("not_sap2000")).toBe(true);
  });
});
