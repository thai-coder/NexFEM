import { describe, expect, it } from "vitest";
import { formatSpans, parseSpans } from "./spans.ts";

describe("parseSpans", () => {
  it("đọc danh sách và cú pháp n@v", () => {
    expect(parseSpans("6, 6, 7.2")).toEqual([6, 6, 7.2]);
    expect(parseSpans("3@6")).toEqual([6, 6, 6]);
    expect(parseSpans("3.9; 4@3.6")).toEqual([3.9, 3.6, 3.6, 3.6, 3.6]);
    expect(parseSpans("2x5 7")).toEqual([5, 5, 7]);
  });
  it("từ chối giá trị sai", () => {
    expect(parseSpans("")).toBeNull();
    expect(parseSpans("6, -1")).toBeNull();
    expect(parseSpans("abc")).toBeNull();
    expect(parseSpans("0@6")).toBeNull();
    expect(parseSpans("500@1")).toBeNull();
  });
  it("viết gọn lại", () => {
    expect(formatSpans([3.9, 3.6, 3.6, 3.6])).toBe("3.9, 3@3.6");
  });
});
