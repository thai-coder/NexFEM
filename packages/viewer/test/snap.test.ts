import { sampleModel } from "@nexfem/model-core";
import { describe, expect, it } from "vitest";
import { visibleObjects } from "../src/filter.ts";
import { ALL_SNAPS, gridLines, orthoLock, pickSnap, snapPoints, type P3 } from "../src/snap.ts";

const m = sampleModel();
const plan = visibleObjects(m, { kind: "plan", story: "story-3" });
// Chiếu đơn giản: 10 px / m theo mặt bằng.
const toScreen = (p: P3): [number, number] => [p[0] * 10, p[1] * 10];

describe("snapPoints", () => {
  it("mặt bằng có nút, giao lưới, trung điểm", () => {
    const pts = snapPoints(m, plan, ALL_SNAPS);
    expect(pts.filter((p) => p.kind === "grid").length).toBe(12);
    expect(pts.filter((p) => p.kind === "joint").length).toBe(12);
    expect(pts.filter((p) => p.kind === "mid").length).toBe(17);
    expect(pts.find((p) => p.kind === "grid" && p.label === "B-2")?.p).toEqual([6, 7.2, 11.1]);
  });
  it("mặt đứng: giao trục với cao độ tầng", () => {
    const el = visibleObjects(m, { kind: "elevation", grid: "grid-main", line: "gx-0" });
    const pts = snapPoints(m, el, { joint: false, grid: true, mid: false, gridline: false });
    expect(pts.length).toBe(3 * 6);
    expect(pts[0]!.p[0]).toBe(0);
  });
});

describe("pickSnap", () => {
  const pts = snapPoints(m, plan, ALL_SNAPS);
  const lines = gridLines(m, plan);
  it("ưu tiên nút hơn giao lưới khi trùng vị trí", () => {
    const r = pickSnap([6.02, 0.03, 11.1], [60.2, 0.3], pts, lines, ALL_SNAPS, toScreen, 12, 0.1);
    expect(r.kind).toBe("joint");
    expect(r.p).toEqual([6, 0, 11.1]);
  });
  it("bắt trung điểm, rồi trên trục, rồi tự do", () => {
    expect(pickSnap([3.05, 0, 11.1], [30.5, 0], pts, lines, ALL_SNAPS, toScreen, 12, 0.1).kind).toBe("mid");
    const g = pickSnap([5.95, 2, 11.1], [59.5, 20], pts, lines, ALL_SNAPS, toScreen, 12, 0.1);
    expect(g.kind).toBe("gridline");
    expect(g.p[0]).toBeCloseTo(6);
    expect(g.p[1]).toBeCloseTo(2);
    expect(pickSnap([5.95, 2, 11.1], [59.5, 20], pts, lines, { ...ALL_SNAPS, gridline: false }, toScreen, 12, 0.1).kind).toBe("free");
  });
});

describe("orthoLock", () => {
  it("giữ phương lệch nhiều hơn", () => {
    expect(orthoLock([0, 0, 3], [5, 0.4, 3], "z")).toEqual([5, 0, 3]);
    expect(orthoLock([0, 0, 0], [6, 0, 0.2], "y")).toEqual([6, 0, 0]);
  });
});
