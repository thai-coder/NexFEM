import { sampleModel } from "@nexfem/model-core";
import { describe, expect, it } from "vitest";
import { segmentIntersectsRect, viewTitle, visibleObjects } from "../src/filter.ts";

const m = sampleModel();
const labels = { plan: "Plan", elevation: "Elevation", view3d: "3D", axis: "Trục" };

describe("visibleObjects", () => {
  it("3D hiện toàn bộ", () => {
    const v = visibleObjects(m, { kind: "3d" });
    expect(v.frames.length).toBe(m.frames.length);
    expect(v.plane).toBeUndefined();
  });

  it("Plan tầng 2: dầm, sàn và đầu cột tầng 2", () => {
    const v = visibleObjects(m, { kind: "plan", story: "story-2" });
    expect(v.frames.every((f) => f.kind === "beam")).toBe(true);
    // lưới 4x3: dầm X 3*3 + dầm Y 4*2
    expect(v.frames.length).toBe(17);
    expect(v.columnMarks.length).toBe(12);
    expect(v.shells.length).toBe(6);
    expect(v.plane).toEqual({ axis: "z", value: 7.5 });
  });

  it("Elevation trục B: cột và dầm trong mặt phẳng x = 6", () => {
    const v = visibleObjects(m, { kind: "elevation", grid: "grid-main", line: "gx-1" });
    expect(v.plane).toEqual({ axis: "x", value: 6 });
    // mỗi tầng: 3 cột + 2 dầm theo Y
    expect(v.frames.length).toBe(5 * 5);
    expect(v.shells.length).toBe(0);
    expect(viewTitle(m, { kind: "elevation", grid: "grid-main", line: "gx-1" }, labels)).toBe("Elevation – Trục B");
  });
});

describe("segmentIntersectsRect", () => {
  const r = { x0: 0, y0: 0, x1: 10, y1: 10 };
  it("đoạn cắt qua khung", () => expect(segmentIntersectsRect([-5, 5], [15, 5], r)).toBe(true));
  it("đoạn nằm ngoài", () => expect(segmentIntersectsRect([-5, -5], [-1, 20], r)).toBe(false));
  it("một đầu nằm trong", () => expect(segmentIntersectsRect([5, 5], [50, 50], r)).toBe(true));
});
