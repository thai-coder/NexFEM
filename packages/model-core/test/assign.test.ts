import { describe, expect, it } from "vitest";
import { CommandStack, RELEASE_PRESETS, sampleModel, unstableReleases } from "../src/index.ts";

const stack = () => new CommandStack(sampleModel());
const beams = (s: CommandStack, n = 2) => s.model.frames.filter((f) => f.kind === "beam").slice(0, n).map((f) => f.id);

describe("frame.assignReleases", () => {
  it("gán khớp hai đầu rồi bỏ", () => {
    const s = stack();
    const ids = beams(s);
    s.execute("frame.assignReleases", { frames: ids, releases: RELEASE_PRESETS.pinnedBoth });
    expect(s.model.frames.find((f) => f.id === ids[0])!.releases?.i[5]).toBe(true);
    s.execute("frame.assignReleases", { frames: ids, releases: null });
    expect(s.model.frames.find((f) => f.id === ids[0])!.releases).toBeUndefined();
  });

  it("chặn nhả xoắn/lực dọc ở cả hai đầu", () => {
    const s = stack();
    const r = { i: [false, false, false, true, false, false], j: [false, false, false, true, false, false] };
    expect(unstableReleases(r)).toEqual(["T"]);
    expect(() => s.execute("frame.assignReleases", { frames: beams(s), releases: r })).toThrow(/mất ổn định/);
  });
});

describe("frame.assignLoad", () => {
  it("thay thế, cộng thêm và xoá tải theo mẫu tải", () => {
    const s = stack();
    const ids = beams(s);
    s.execute("frame.assignLoad", { frames: ids, pattern: "lp-sdl", kind: "distributed", direction: "gravity", value: 7.5 });
    expect(s.model.frameLoads.length).toBe(2);
    s.execute("frame.assignLoad", { frames: ids, pattern: "lp-sdl", kind: "distributed", direction: "gravity", value: 5 });
    expect(s.model.frameLoads.map((l) => l.value)).toEqual([5, 5]);
    s.execute("frame.assignLoad", { frames: ids.slice(0, 1), pattern: "lp-sdl", kind: "point", direction: "gravity", value: 20, at: 0.5, mode: "add" });
    expect(s.model.frameLoads.length).toBe(3);
    s.execute("frame.assignLoad", { frames: ids, pattern: "lp-sdl", kind: "distributed", direction: "gravity", value: 0, mode: "delete" });
    expect(s.model.frameLoads.length).toBe(0);
  });

  it("báo lỗi thiếu vị trí tải tập trung và mẫu tải không tồn tại", () => {
    const s = stack();
    expect(() => s.execute("frame.assignLoad", { frames: beams(s), pattern: "lp-ll", kind: "point", direction: "gravity", value: 1 })).toThrow(/vị trí/);
    expect(() => s.execute("frame.assignLoad", { frames: beams(s), pattern: "x", kind: "distributed", direction: "gravity", value: 1 })).toThrow(/Không tìm thấy/);
  });
});

describe("shell.assignLoad", () => {
  it("thay tải hoạt tải sàn", () => {
    const s = stack();
    const slab = s.model.shells[0]!.id;
    s.execute("shell.assignLoad", { shells: [slab], pattern: "lp-ll", direction: "gravity", value: 4 });
    const ll = s.model.shellLoads.filter((l) => l.shell === slab && l.pattern === "lp-ll");
    expect(ll.map((l) => l.value)).toEqual([4]);
  });
});
