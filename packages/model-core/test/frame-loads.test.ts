import { describe, expect, it } from "vitest";
import { CommandStack, checkModel, frameAxes, loadOnSegment, parseModel, sampleModel, type FrameLoad, type Model } from "../src/index.ts";

/** Tải `linear` (hình thang/từng đoạn) và R1: tải gắn theo thanh (docs/plans/FRAME_LOAD_SEGMENTS_PLAN.md). */
const BEAM = "bx-0-0-1";
const trap: FrameLoad = { id: "tl", frame: BEAM, pattern: "lp-dl", kind: "linear", direction: "gravity", value: 2, valueEnd: 8, start: 0.25, end: 0.9 };
const withLoad = (load: FrameLoad = trap): Model => {
  const m = sampleModel();
  m.frameLoads.push(load);
  return m;
};
const codes = (m: Model) => checkModel(m).map((d) => d.code);

describe("schema và kiểm tra tải linear", () => {
  it("đọc/ghi đủ trường; tải hợp lệ không báo lỗi", () => {
    const m = parseModel(JSON.parse(JSON.stringify(withLoad())));
    expect(m.frameLoads[0]).toEqual(trap);
    expect(codes(m)).not.toContain("invalid_linear_load");
  });
  it("đoạn ngược, đoạn rỗng, thiếu cường độ cuối: lỗi", () => {
    expect(codes(withLoad({ ...trap, start: 0.9, end: 0.25 }))).toContain("invalid_linear_load");
    expect(codes(withLoad({ ...trap, end: 0.25 }))).toContain("invalid_linear_load");
    const { valueEnd: _v, ...noEnd } = trap;
    expect(codes(withLoad(noEnd as FrameLoad))).toContain("invalid_linear_load");
  });
  it("thanh có vùng cứng: chưa hỗ trợ (PR D), lỗi", () => {
    const m = withLoad();
    m.frames.find((f) => f.id === BEAM)!.offsets = { i: 0.2, j: 0 };
    expect(codes(m)).toContain("linear_load_with_offsets");
  });
  it("loại tải lạ bị schema từ chối (bản cũ cũng vậy: không đọc sai thành tải đều)", () => {
    const raw = JSON.parse(JSON.stringify(withLoad()));
    raw.frameLoads[0].kind = "trapezoid";
    expect(() => parseModel(raw)).toThrow();
  });
});

describe("loadOnSegment: cắt tải theo đoạn khi chia thanh", () => {
  it("linear: cắt và nội suy; tổng hợp lực và mômen tĩnh giữ nguyên", () => {
    const w = (t: number) => 2 + (6 * (t - 0.25)) / 0.65;
    const a = loadOnSegment(trap, 0, 0.5)!;
    const b = loadOnSegment(trap, 0.5, 1)!;
    expect(a).toMatchObject({ kind: "linear", start: 0.5, end: 1, value: 2 });
    expect(a.valueEnd).toBeCloseTo(w(0.5), 12);
    expect(b.start).toBe(0);
    expect(b.end).toBeCloseTo(0.8, 12);
    expect(b.value).toBeCloseTo(w(0.5), 12);
    expect(b.valueEnd).toBeCloseTo(8, 12);
    // Hợp lực (theo chiều dài gốc L = 1) và mômen quanh đầu i.
    const seg = (l: ReturnType<typeof loadOnSegment>, t0: number, len: number) => {
      const s = t0 + l!.start! * len;
      const e = t0 + l!.end! * len;
      const [p, q] = [l!.value, l!.valueEnd!];
      const f = ((p + q) / 2) * (e - s);
      const x = s + ((e - s) * (p + 2 * q)) / (3 * (p + q));
      return [f, f * x];
    };
    const whole = seg(trap, 0, 1);
    const parts = [seg(a, 0, 0.5), seg(b, 0.5, 0.5)];
    expect(parts[0]![0]! + parts[1]![0]!).toBeCloseTo(whole[0]!, 12);
    expect(parts[0]![1]! + parts[1]![1]!).toBeCloseTo(whole[1]!, 12);
  });
  it("đoạn không có tải: null; tải đều và tập trung", () => {
    expect(loadOnSegment(trap, 0, 0.2)).toBeNull();
    expect(loadOnSegment(trap, 0.95, 1)).toBeNull();
    const dist: FrameLoad = { id: "d", frame: BEAM, pattern: "lp-dl", kind: "distributed", direction: "gravity", value: 3 };
    expect(loadOnSegment(dist, 0.3, 0.6)).toEqual({ pattern: "lp-dl", kind: "distributed", direction: "gravity", value: 3 });
    const pt: FrameLoad = { id: "p", frame: BEAM, pattern: "lp-dl", kind: "point", direction: "gravity", value: 3, at: 0.75 };
    expect(loadOnSegment(pt, 0, 0.5)).toBeNull();
    expect(loadOnSegment(pt, 0.5, 1)!.at).toBeCloseTo(0.5, 12);
  });
});

describe("R1: tải gắn theo thanh", () => {
  it("dời nút đầu thanh: tải còn nguyên, vị trí tương đối giữ nguyên", () => {
    const s = new CommandStack(withLoad());
    const beam = s.model.frames.find((f) => f.id === BEAM)!;
    const j = s.model.joints.find((x) => x.id === beam.j)!;
    s.execute("joint.move", { joint: j.id, point: [j.x + 0.7, j.y, j.z] });
    expect(s.model.frameLoads).toEqual([trap]);
    s.undo();
    expect(s.model.frameLoads).toEqual([trap]);
  });
  for (const options of [
    { mode: "linear", dx: 0, dy: 1, dz: 0, count: 2 },
    { mode: "mirror", axis: "x", value: 20 },
    { mode: "story", stories: ["story-3"] },
  ] as const) {
    it(`nhân bản (${options.mode}): mỗi thanh mới có bản sao đủ trường của tải linear`, () => {
      const m = withLoad();
      m.frames.find((f) => f.id === BEAM)!.angle = 30;
      if (options.mode === "story") {
        // Mô hình mẫu đã có dầm cùng vị trí ở tầng đích (nhân bản bỏ qua bản trùng): bỏ dầm đó trước.
        const src = m.frames.find((f) => f.id === BEAM)!;
        const xy = (id: string) => m.joints.find((j) => j.id === id)!;
        const same = (a: string, b: string) => Math.abs(xy(a).x - xy(b).x) < 1e-6 && Math.abs(xy(a).y - xy(b).y) < 1e-6;
        m.frames = m.frames.filter((f) => !(f.story === "story-3" && f.kind === "beam" && same(f.i, src.i) && same(f.j, src.j)));
      }
      const s = new CommandStack(m);
      const r = s.execute("objects.replicate", { ids: [BEAM], options }).result as { created: string[] };
      expect(r.created.length).toBeGreaterThan(0);
      for (const id of r.created) {
        const copies = s.model.frameLoads.filter((l) => l.frame === id);
        expect(copies).toHaveLength(1);
        const { id: _i, frame: _f, ...rest } = copies[0]!;
        const { id: _i2, frame: _f2, ...want } = trap;
        // Tải trọng lực không đổi qua gương; vị trí tương đối giữ nguyên ở mọi chế độ.
        expect(rest).toEqual(want);
        // Góc xoay đi theo thanh (đối xứng: tính lại, kiểm ở test riêng bên dưới).
        if (options.mode !== "mirror") expect(s.model.frames.find((f) => f.id === id)!.angle).toBe(30);
      }
      expect(s.model.frameLoads.find((l) => l.id === trap.id)).toEqual(trap);
      s.undo();
      expect(s.model.frameLoads).toEqual([trap]);
    });
  }
  it("nhân bản không chép tải khi tắt tuỳ chọn", () => {
    const s = new CommandStack(withLoad());
    s.execute("objects.replicate", { ids: [BEAM], options: { mode: "linear", dx: 0, dy: 1, dz: 0, count: 1 }, copyLoads: false });
    expect(s.model.frameLoads).toEqual([trap]);
  });
});

describe("nhân bản đối xứng: lật theo gương", () => {
  type V = [number, number, number];
  const pts = (m: Model, id: string): [V, V] => {
    const f = m.frames.find((x) => x.id === id)!;
    const p = (j: string): V => {
      const q = m.joints.find((x) => x.id === j)!;
      return [q.x, q.y, q.z];
    };
    return [p(f.i), p(f.j)];
  };
  /** Vectơ tải theo hệ tổng thể (giống fem-solver: gravity = −Z, local theo trục có góc xoay). */
  const vec = (m: Model, l: FrameLoad): V => {
    const f = m.frames.find((x) => x.id === l.frame)!;
    const [a, b] = pts(m, f.id);
    const [e1, e2, e3] = frameAxes(a, b, f.angle ?? 0);
    const v = l.value;
    const by: Record<string, V> = {
      gravity: [0, 0, -v], globalX: [v, 0, 0], globalY: [0, v, 0], globalZ: [0, 0, v],
      localX: e1.map((c) => c * v) as V, local2: e2.map((c) => c * v) as V, local3: e3.map((c) => c * v) as V,
    };
    return by[l.direction]!;
  };
  const dirs = ["gravity", "globalX", "globalY", "globalZ", "localX", "local2", "local3"] as const;
  for (const axis of ["x", "y"] as const) {
    for (const angle of [undefined, 30, -75]) {
      it(`gương ${axis}, góc ${angle ?? "mặc định"}: tải của bản sao là ảnh gương của tải gốc (dầm, cột, giằng)`, () => {
        const m = sampleModel();
        const flip = (v: V): V => (axis === "x" ? [-v[0], v[1], v[2]] : [v[0], -v[1], v[2]]);
        // Một dầm theo X, một dầm theo Y, một cột và một giằng xiên ở tầng 1.
        const beamX = m.frames.find((f) => f.kind === "beam" && f.story === "story-1" && Math.abs(pts(m, f.id)[0][1] - pts(m, f.id)[1][1]) < 1e-9)!;
        const beamY = m.frames.find((f) => f.kind === "beam" && f.story === "story-1" && Math.abs(pts(m, f.id)[0][0] - pts(m, f.id)[1][0]) < 1e-9)!;
        const col = m.frames.find((f) => f.kind === "column" && f.story === "story-1")!;
        const s0 = new CommandStack(m);
        s0.execute("frame.add", { kind: "brace", from: pts(m, col.id)[0], to: pts(m, beamX.id)[1], section: col.section, story: "story-1" });
        const brace = s0.model.frames.at(-1)!;
        const model = structuredClone(s0.model);
        // Bản sao được tạo theo thứ tự thanh trong mô hình.
        const ids = model.frames.map((f) => f.id).filter((id) => [beamX.id, beamY.id, col.id, brace.id].includes(id));
        for (const id of ids) {
          if (angle !== undefined) model.frames.find((f) => f.id === id)!.angle = angle;
          for (const dir of dirs) model.frameLoads.push({ id: `${id}-${dir}`, frame: id, pattern: "lp-dl", kind: "linear", direction: dir, value: 3, valueEnd: 5, start: 0.1, end: 0.8 });
        }
        const s = new CommandStack(model);
        const r = s.execute("objects.replicate", { ids, options: { mode: "mirror", axis, value: 50 } }).result as { created: string[] };
        expect(r.created).toHaveLength(4);
        const after = s.model;
        r.created.forEach((nid, k) => {
          // i, j của bản sao là ảnh gương của i, j gốc.
          const [a, b] = pts(after, ids[k]!);
          const [na, nb] = pts(after, nid);
          const img = (p: V): V => (axis === "x" ? [100 - p[0], p[1], p[2]] : [p[0], 100 - p[1], p[2]]);
          expect(na.map((c, i) => c - img(a)[i]!).every((x) => Math.abs(x) < 1e-9)).toBe(true);
          expect(nb.map((c, i) => c - img(b)[i]!).every((x) => Math.abs(x) < 1e-9)).toBe(true);
          for (const dir of dirs) {
            const src = after.frameLoads.find((l) => l.id === `${ids[k]}-${dir}`)!;
            const cp = after.frameLoads.find((l) => l.frame === nid && l.direction === dir)!;
            const want = flip(vec(after, src));
            const got = vec(after, cp);
            for (let c = 0; c < 3; c++) expect(got[c], `${dir}[${c}]`).toBeCloseTo(want[c]!, 9);
            expect(cp.start).toBe(src.start);
            expect(cp.end).toBe(src.end);
            expect(Math.abs(cp.valueEnd!)).toBe(5);
          }
        });
      });
    }
  }
  it("tải sàn local3 đổi dấu (pháp tuyến đảo qua gương); trọng lực giữ nguyên", () => {
    const m = sampleModel();
    const slab = m.shells.find((x) => x.kind === "slab")!;
    m.shellLoads.push({ id: "q3", shell: slab.id, pattern: "lp-dl", direction: "local3", value: 2 }, { id: "qg", shell: slab.id, pattern: "lp-dl", direction: "gravity", value: 2 });
    const s = new CommandStack(m);
    const r = s.execute("objects.replicate", { ids: [slab.id], options: { mode: "mirror", axis: "y", value: 50 } }).result as { created: string[] };
    const copies = s.model.shellLoads.filter((l) => l.shell === r.created[0]);
    expect(copies.find((l) => l.id.startsWith("q3-"))!.value).toBe(-2);
    expect(copies.find((l) => l.id.startsWith("qg-"))!.value).toBe(2);
  });
});
