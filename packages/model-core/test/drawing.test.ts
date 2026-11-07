import { describe, expect, it } from "vitest";
import {
  CommandStack,
  columnOps,
  planLineOps,
  sampleModel,
  slabOps,
  storiesForScope,
  wallOps,
  type Model,
} from "../src/index.ts";

const stack = () => new CommandStack(sampleModel());
const story = (m: Model, id: string) => m.stories.find((s) => s.id === id)!;

describe("storiesForScope", () => {
  const m = sampleModel(); // Tầng 1 là tầng chuẩn; Tầng 2–5 giống Tầng 1
  it("một tầng / tầng tương tự / tất cả", () => {
    expect(storiesForScope(m, "story-3", "one").map((s) => s.id)).toEqual(["story-3"]);
    expect(storiesForScope(m, "story-3", "similar").length).toBe(5);
    expect(storiesForScope(m, "story-3", "all").length).toBe(5);
    expect(storiesForScope(m, "story-0", "all").map((s) => s.id)).not.toContain("story-0");
  });
});

describe("lệnh vẽ", () => {
  it("dầm giữa nhịp ở hai tầng = một bước undo", () => {
    const s = stack();
    const m = s.model;
    const n = m.frames.length;
    const ops = planLineOps("beam", [3, 0], [3, 7.2], [story(m, "story-2"), story(m, "story-3")], "sec-beam");
    s.executeBatch("Vẽ dầm", ops);
    expect(s.model.frames.length).toBe(n + 2);
    expect(s.model.frames.at(-1)).toMatchObject({ kind: "beam", story: "story-3", label: "B87" });
    s.undo();
    expect(s.model.frames.length).toBe(n);
  });

  it("cột tại điểm giữa nhịp từ tầng dưới lên", () => {
    const s = stack();
    const m = s.model;
    s.executeBatch("Vẽ cột", columnOps(m, [3, 3.6], [story(m, "story-1")], "sec-col"));
    const c = s.model.frames.at(-1)!;
    const j = new Map(s.model.joints.map((x) => [x.id, x]));
    expect(j.get(c.i)!.z).toBe(0);
    expect(j.get(c.j)!.z).toBeCloseTo(3.9);
    // Không chạy cho chân công trình (không có tầng dưới).
    expect(columnOps(m, [3, 3.6], [story(m, "story-0")], "sec-col")).toEqual([]);
  });

  it("sàn đa giác và vách", () => {
    const s = stack();
    const m = s.model;
    s.executeBatch("Vẽ sàn", slabOps([[0, 0], [6, 0], [3, 5]], [story(m, "story-5")], "sec-slab"));
    expect(s.model.shells.at(-1)).toMatchObject({ kind: "slab", label: "F31", story: "story-5" });
    s.executeBatch("Vẽ vách", wallOps(m, [0, 0], [6, 0], [story(m, "story-1")], "sec-slab"));
    const w = s.model.shells.at(-1)!;
    expect(w.kind).toBe("wall");
    expect(w.label).toBe("W1");
    expect(w.joints.length).toBe(4);
  });

  it("từ chối sàn trùng, sàn diện tích 0", () => {
    const s = stack();
    const m = s.model;
    // Ô A-B / 1-2 tầng 1 đã có sàn F1.
    expect(() => s.executeBatch("x", slabOps([[0, 0], [6, 0], [6, 7.2], [0, 7.2]], [story(m, "story-1")], "sec-slab"))).toThrow(/Đã có sàn/);
    expect(() => s.executeBatch("x", slabOps([[0, 0], [3, 0], [6, 0]], [story(m, "story-1")], "sec-slab"))).toThrow(/diện tích bằng 0/);
  });

  it("joint.add trả về nút có sẵn nếu trùng", () => {
    const s = stack();
    const n = s.model.joints.length;
    s.execute("joint.add", { point: [0, 0, 0] });
    expect(s.model.joints.length).toBe(n);
    s.execute("joint.add", { point: [1, 1, 0] });
    expect(s.model.joints.length).toBe(n + 1);
  });
});

describe("objects.replicate", () => {
  it("tịnh tiến 2 lần theo X", () => {
    const s = stack();
    const beam = s.model.frames.find((f) => f.label === "B1")!; // A-B trục 1 tầng 1
    const r = s.execute("objects.replicate", { ids: [beam.id], options: { mode: "linear", dx: 0, dy: 7.2 * 0 + 1, dz: 0, count: 2 } }).result as { created: string[] };
    expect(r.created.length).toBe(2);
    const last = s.model.frames.find((f) => f.id === r.created[1])!;
    const j = new Map(s.model.joints.map((x) => [x.id, x]));
    expect(j.get(last.i)!.y).toBeCloseTo(2);
    expect(last.story).toBe(beam.story);
  });

  it("theo tầng: sao chép giằng và tải sàn sang tầng khác", () => {
    const s = stack();
    s.execute("frame.add", { kind: "brace", from: [0, 0, 0], to: [6, 0, 3.9], section: "sec-beam", story: "story-1" });
    const brace = s.model.frames.at(-1)!;
    const r = s.execute("objects.replicate", { ids: [brace.id], options: { mode: "story", stories: ["story-2", "story-3", "story-1"] } }).result as {
      created: string[];
      skipped: number;
    };
    expect(r.created.length).toBe(2);
    expect(r.skipped).toBe(1);
    const j = new Map(s.model.joints.map((x) => [x.id, x]));
    const c = s.model.frames.find((f) => f.id === r.created[1])!;
    expect(c.story).toBe("story-3");
    expect(j.get(c.i)!.z).toBeCloseTo(7.5);
    expect(j.get(c.j)!.z).toBeCloseTo(11.1);
  });

  it("sao chép sàn kèm tải; bỏ qua bản trùng", () => {
    const s = stack();
    // Sàn ô A-B/1-2 tầng 1 đối xứng qua trục x = 9 (giữa B-C... ) sẽ trùng sàn có sẵn ô C-D.
    const slab = s.model.shells.find((x) => x.label === "F1")!;
    const loadsBefore = s.model.shellLoads.length;
    const r = s.execute("objects.replicate", { ids: [slab.id], options: { mode: "mirror", axis: "x", value: 9 } }).result as { created: string[]; skipped: number };
    expect(r).toEqual({ created: [], skipped: 1 });
    const r2 = s.execute("objects.replicate", { ids: [slab.id], options: { mode: "linear", dx: 0, dy: -7.2, dz: 0, count: 1 } }).result as { created: string[] };
    expect(r2.created.length).toBe(1);
    expect(s.model.shellLoads.length).toBe(loadsBefore + 2);
  });
});
