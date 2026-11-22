import { importS2k } from "@nexfem/io-formats";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { useModel } from "../stores/model.ts";
import { openCsiImport } from "./csiImport.ts";

/** Chặn ở tầng mở mô hình, không chỉ ở nút bấm trong hộp thoại. Đầu vào tổng hợp (tests/benchmarks/csi/cases). */
const text = readFileSync(fileURLToPath(new URL("../../../../tests/benchmarks/csi/cases/simply-supported-udl.s2k", import.meta.url)), "utf8");

describe("openCsiImport", () => {
  it("không đưa kết quả nhập bị chặn vào mô hình", () => {
    const before = useModel.getState().model;
    const r = importS2k(text.replace("FOverLB=5", "FOverLB=8"));
    expect(r.report.blocked).toBe(true);
    expect(openCsiImport({ format: "s2k", ...r })).toBe(false);
    expect(useModel.getState().model).toBe(before);
  });
  it("mở kết quả nhập không bị chặn", () => {
    const r = importS2k(text);
    expect(openCsiImport({ format: "s2k", ...r })).toBe(true);
    expect(useModel.getState().model.frames).toHaveLength(1);
  });
});
