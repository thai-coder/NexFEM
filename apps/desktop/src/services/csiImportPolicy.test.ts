import { describe, expect, it } from "vitest";
import { csiImportPolicy } from "./csiImportPolicy.ts";

describe("mở mô hình nhập CSI", () => {
  const units = { force: "KIP", length: "IN", temperature: "F" };
  const r = (format: string, u: typeof units | null, blocked: boolean) => ({ format: format as "s2k", report: { units: u, blocked } });
  it("chặn lỗi nhập cho cả SAP2000 và ETABS", () => {
    for (const format of ["s2k", "e2k"]) {
      expect(csiImportPolicy(r(format, units, true))).toEqual({ readable: true, hasImportErrors: true, canOpen: false });
    }
  });
  it("cho mở mô hình đọc được khi không bị chặn", () => {
    expect(csiImportPolicy(r("s2k", units, false)).canOpen).toBe(true);
  });
  it("không cho mở nhị phân hoặc văn bản không nhận diện đơn vị", () => {
    expect(csiImportPolicy(r("sdb", units, false)).canOpen).toBe(false);
    expect(csiImportPolicy(r("s2k", null, false)).canOpen).toBe(false);
  });
});
