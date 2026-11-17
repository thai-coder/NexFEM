import { describe, expect, it } from "vitest";
import { csiImportPolicy } from "./csiImportPolicy.ts";

describe("mở mô hình nhập CSI", () => {
  const units = { force: "KIP", length: "IN" };
  it("chặn lỗi nhập cho cả SAP2000 và ETABS", () => {
    for (const format of ["s2k", "e2k"]) {
      expect(csiImportPolicy(format, units, [{ level: "error" }])).toEqual({ readable: true, hasImportErrors: true, canOpen: false });
    }
  });
  it("cho mở mô hình đọc được khi chỉ có cảnh báo hoặc thông tin", () => {
    expect(csiImportPolicy("s2k", units, [{ level: "warning" }, { level: "info" }]).canOpen).toBe(true);
  });
  it("không cho mở nhị phân hoặc văn bản không nhận diện đơn vị", () => {
    expect(csiImportPolicy("sdb", units, []).canOpen).toBe(false);
    expect(csiImportPolicy("s2k", null, []).canOpen).toBe(false);
  });
});
