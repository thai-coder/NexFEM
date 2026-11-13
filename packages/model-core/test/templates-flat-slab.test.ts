import { describe, expect, it } from "vitest";
import { checkModel, createRcFrameModel, parseModel, simpleStoryHeights, uniformSpans } from "../src/index.ts";

const base = { xSpans: [6, 6, 6], ySpans: [7, 7], storyHeights: [3.9, 3.6] };

describe("mẫu sàn phẳng", () => {
  it("sàn phẳng: cột và sàn, không dầm, không có tiết diện dầm thừa", () => {
    const m = createRcFrameModel({ ...base, objects: "flatSlab" });
    expect(m.frames.every((f) => f.kind === "column")).toBe(true);
    expect(m.frames.length).toBe(4 * 3 * 2);
    expect(m.shells.length).toBe(3 * 2 * 2);
    expect(m.frameSections.map((s) => s.id)).toEqual(["sec-col"]);
    expect(() => parseModel(m)).not.toThrow();
  });

  it("sàn phẳng có dầm biên: dầm chỉ nằm trên chu vi mỗi tầng", () => {
    const m = createRcFrameModel({ ...base, objects: "flatSlabBeams" });
    const beams = m.frames.filter((f) => f.kind === "beam");
    // Mỗi tầng: 2 đường biên X × 3 nhịp + 2 đường biên Y × 2 nhịp = 10 dầm.
    expect(beams.length).toBe(10 * 2);
    const j = new Map(m.joints.map((x) => [x.id, x]));
    for (const b of beams) {
      const a = j.get(b.i)!;
      const c = j.get(b.j)!;
      const onX = a.y === c.y && (a.y === 0 || a.y === 14);
      const onY = a.x === c.x && (a.x === 0 || a.x === 18);
      expect(onX || onY).toBe(true);
    }
    expect(m.shells.length).toBe(12);
    expect(m.frameSections.map((s) => s.id)).toEqual(["sec-col", "sec-beam"]);
  });

  it("mẫu khung đủ lưới không đổi: dầm đủ hai phương", () => {
    const m = createRcFrameModel({ ...base, objects: "frame" });
    expect(m.frames.filter((f) => f.kind === "beam").length).toBe((4 * 2 + 3 * 3) * 2);
  });

  it("không có tham chiếu hỏng (checkModel không báo lỗi)", () => {
    for (const objects of ["flatSlab", "flatSlabBeams"] as const) {
      const issues = checkModel(createRcFrameModel({ ...base, objects }));
      expect(issues.filter((i) => i.level === "error")).toEqual([]);
    }
  });
});

describe("lưới đều và tầng đơn giản", () => {
  it("uniformSpans và simpleStoryHeights", () => {
    expect(uniformSpans(3, 6)).toEqual([6, 6, 6]);
    expect(uniformSpans(0, 6)).toEqual([]);
    expect(simpleStoryHeights(4, 3.6, 3.9)).toEqual([3.9, 3.6, 3.6, 3.6]);
    expect(simpleStoryHeights(1, 3.6, 3.9)).toEqual([3.9]);
  });
});
