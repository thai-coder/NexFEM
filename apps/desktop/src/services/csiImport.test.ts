import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { en } from "../i18n/en.ts";
import { vi } from "../i18n/vi.ts";

/** Mọi mã thông báo bộ nhập .e2k phát ra đều có câu tiếng Việt và tiếng Anh. */
describe("chuỗi giao diện cho báo cáo nhập ETABS", () => {
  const src = readFileSync(fileURLToPath(new URL("../../../../packages/io-formats/src/csi/e2k-import.ts", import.meta.url)), "utf8");
  const codes = new Set([...src.matchAll(/"([a-z]+(?:_[a-z]+)+|program)"/g)].map((m) => m[1]!).filter((c) => !c.includes("__")));
  // Bỏ các chuỗi không phải mã thông báo.
  for (const notCode of ["shell_thin"]) codes.delete(notCode);
  it("có đủ bản dịch", () => {
    const missingVi = [...codes].filter((c) => !(c in vi.csi.codes));
    const missingEn = [...codes].filter((c) => !(c in en.csi.codes));
    expect(missingVi).toEqual([]);
    expect(missingEn).toEqual([]);
    expect(codes.size).toBeGreaterThan(50);
  });
});
