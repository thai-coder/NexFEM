import { describe, expect, it } from "vitest";
import { parseConsole } from "./parse.ts";

describe("parseConsole", () => {
  it("beam với hai điểm", () => {
    expect(parseConsole("beam 0,0 6,7.2")).toEqual({ kind: "beam", from: [0, 0], to: [6, 7.2] });
  });
  it("column và select", () => {
    expect(parseConsole("col 3,4")).toEqual({ kind: "column", at: [3, 4] });
    expect(parseConsole("select B12")).toEqual({ kind: "select", label: "B12" });
  });
  it("lệnh thô với JSON", () => {
    expect(parseConsole('cmd model.setName {"name":"A"}')).toEqual({ kind: "raw", name: "model.setName", args: { name: "A" } });
  });
  it("báo lỗi khi sai cú pháp", () => {
    expect(parseConsole("beam 0,0").kind).toBe("error");
    expect(parseConsole("xyz")).toEqual({ kind: "error", message: "unknown:xyz" });
  });
});
