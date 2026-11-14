import { sampleModel } from "@nexfem/model-core";
import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY, applyDisplayFilter, normalizeDisplay, visibleObjects } from "../src/index.ts";

describe("tuỳ chọn hiển thị theo khung nhìn", () => {
  it("bổ sung khoá mặc định cho dữ liệu cũ; restraints cũ điều khiển cả nhả liên kết", () => {
    expect(normalizeDisplay(undefined)).toEqual(DEFAULT_DISPLAY);
    const old = normalizeDisplay({ joints: false, jointLabels: true, frameLabels: false, restraints: false });
    expect(old).toMatchObject({ joints: false, jointLabels: true, restraints: false, releases: false, beams: true, grid: true });
    expect(normalizeDisplay({ restraints: false, releases: true }).releases).toBe(true);
    // Giá trị không phải boolean bị bỏ qua.
    expect(normalizeDisplay({ beams: "no" as unknown as boolean }).beams).toBe(true);
  });

  it("ẩn theo loại thanh và loại sàn/vách", () => {
    const m = sampleModel();
    const vis = visibleObjects(m, { kind: "3d" });
    expect(applyDisplayFilter(vis, DEFAULT_DISPLAY)).toBe(vis);
    const noBeams = applyDisplayFilter(vis, { ...DEFAULT_DISPLAY, beams: false });
    expect(noBeams.frames.length).toBeGreaterThan(0);
    expect(noBeams.frames.every((f) => f.kind === "column")).toBe(true);
    expect(noBeams.joints).toBe(vis.joints);
    const noSlabs = applyDisplayFilter(vis, { ...DEFAULT_DISPLAY, slabs: false });
    expect(noSlabs.shells.length).toBe(0);
    expect(noSlabs.frames.length).toBe(vis.frames.length);
  });

  it("ẩn cột thì bỏ cả ô cột cắt qua mặt bằng", () => {
    const m = sampleModel();
    const vis = visibleObjects(m, { kind: "plan", story: m.stories[2]!.id });
    expect(vis.columnMarks.length).toBeGreaterThan(0);
    expect(applyDisplayFilter(vis, { ...DEFAULT_DISPLAY, columns: false }).columnMarks).toEqual([]);
  });
});
