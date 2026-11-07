import { describe, expect, it } from "vitest";
import {
  CommandError,
  CommandStack,
  createRcFrameModel,
  parseProject,
  ProjectError,
  sampleModel,
  serializeProject,
  type GridSystem,
} from "../src/index.ts";

const stack = () => new CommandStack(sampleModel());

describe("definition.upsert / delete", () => {
  it("thêm vật liệu mới và sửa tiết diện có sẵn", () => {
    const s = stack();
    s.execute("definition.upsert", {
      collection: "materials",
      item: { id: "mat-b30", name: "B30", type: "concrete", E: 32.5e6, nu: 0.2, gamma: 25 },
    });
    expect(s.model.materials.map((m) => m.name)).toContain("B30");
    const beam = s.model.frameSections.find((x) => x.id === "sec-beam")!;
    s.execute("definition.upsert", { collection: "frameSections", item: { ...beam, name: "D300x700", geometry: { shape: "rect", b: 0.3, h: 0.7 } } });
    expect(s.model.frameSections.find((x) => x.id === "sec-beam")?.name).toBe("D300x700");
    expect(s.model.frameSections.length).toBe(2);
  });

  it("chặn trùng tên và tham chiếu thiếu", () => {
    const s = stack();
    expect(() =>
      s.execute("definition.upsert", { collection: "frameSections", item: { id: "x", name: "c400x400", material: "mat-b25", geometry: { shape: "rect", b: 1, h: 1 } } }),
    ).toThrow(/đã có/);
    expect(() =>
      s.execute("definition.upsert", { collection: "frameSections", item: { id: "x", name: "X", material: "khong-co", geometry: { shape: "rect", b: 1, h: 1 } } }),
    ).toThrow(/không tìm thấy vật liệu/);
    expect(() => s.execute("definition.upsert", { collection: "combos", item: { id: "c", name: "C", type: "linearAdd", items: [{ case: "zzz", factor: 1 }] } })).toThrow(
      /không tìm thấy trường hợp tải/,
    );
  });

  it("không xoá định nghĩa đang dùng, xoá được khi không dùng", () => {
    const s = stack();
    expect(() => s.execute("definition.delete", { collection: "materials", id: "mat-b25" })).toThrow(CommandError);
    expect(() => s.execute("definition.delete", { collection: "frameSections", id: "sec-col" })).toThrow(/đang dùng ở C1/);
    s.execute("definition.delete", { collection: "materials", id: "mat-cb400-v" });
    expect(s.model.materials.length).toBe(1);
  });
});

describe("batch", () => {
  it("nhiều lệnh = một bước undo; lỗi thì huỷ cả lô", () => {
    const s = stack();
    const before = s.model;
    s.executeBatch("Hộp thoại vật liệu", [
      { name: "definition.upsert", args: { collection: "materials", item: { id: "m1", name: "M1", type: "other", E: 1, nu: 0.2, gamma: 0 } } },
      { name: "definition.upsert", args: { collection: "materials", item: { id: "m2", name: "M2", type: "other", E: 1, nu: 0.2, gamma: 0 } } },
    ]);
    expect(s.model.materials.length).toBe(4);
    expect(s.undoTitle).toBe("Hộp thoại vật liệu");
    s.undo();
    expect(s.model).toEqual(before);

    const mid = s.model;
    expect(() =>
      s.executeBatch("x", [
        { name: "definition.upsert", args: { collection: "materials", item: { id: "m3", name: "M3", type: "other", E: 1, nu: 0.2, gamma: 0 } } },
        { name: "definition.delete", args: { collection: "materials", id: "mat-b25" } },
      ]),
    ).toThrow();
    expect(s.model).toBe(mid);
  });
});

describe("grid.set", () => {
  it("dời trục B kéo theo nút trên trục", () => {
    const s = stack();
    const g = structuredClone(s.model.grids[0]!) as GridSystem;
    g.x[1]!.coord = 6.5;
    s.execute("grid.set", { grid: g });
    const onB = s.model.joints.filter((j) => Math.abs(j.x - 6.5) < 1e-9);
    expect(onB.length).toBe(3 * 6);
    expect(s.model.joints.some((j) => Math.abs(j.x - 6) < 1e-9)).toBe(false);
  });

  it("thêm trục mới và báo trùng tên", () => {
    const s = stack();
    const g = structuredClone(s.model.grids[0]!) as GridSystem;
    g.x.push({ id: "gx-new", label: "E", coord: 24 });
    s.execute("grid.set", { grid: g });
    expect(s.model.grids[0]!.x.map((l) => l.label)).toEqual(["A", "B", "C", "D", "E"]);
    g.x.push({ id: "gx-dup", label: "E", coord: 30 });
    expect(() => s.execute("grid.set", { grid: g })).toThrow(/bị trùng/);
  });
});

describe("stories.set", () => {
  it("đổi chiều cao tầng 1 nâng mọi tầng phía trên", () => {
    const s = stack();
    const stories = s.model.stories.map(({ elevation: _e, ...rest }) => rest);
    stories[1]!.height = 4.5;
    s.execute("stories.set", { stories });
    expect(s.model.stories[1]!.elevation).toBeCloseTo(4.5);
    expect(s.model.stories.at(-1)!.elevation).toBeCloseTo(4.5 + 3.6 * 4);
    const top = s.model.joints.filter((j) => j.story === "story-5");
    expect(top.every((j) => Math.abs(j.z - 18.9) < 1e-9)).toBe(true);
  });

  it("không xoá tầng còn đối tượng; thêm tầng mới ở trên cùng", () => {
    const s = stack();
    const stories = s.model.stories.map(({ elevation: _e, ...rest }) => rest);
    expect(() => s.execute("stories.set", { stories: stories.slice(0, -1) })).toThrow(/còn đối tượng/);
    s.execute("stories.set", { stories: [...stories, { id: "story-6", name: "Mái", height: 3, masterStory: false }] });
    expect(s.model.stories.at(-1)).toMatchObject({ name: "Mái", elevation: 21.3 });
  });
});

describe("templates", () => {
  it("mẫu chỉ có lưới", () => {
    const m = createRcFrameModel({ xSpans: [5], ySpans: [5], storyHeights: [3], objects: "grid", concrete: "B30" });
    expect(m.frames.length).toBe(0);
    expect(m.joints.length).toBe(0);
    expect(m.materials[0]!.name).toBe("B30");
  });
});

describe(".nxf", () => {
  it("lưu rồi mở lại giữ nguyên mô hình", () => {
    const m = sampleModel();
    const bytes = serializeProject(m);
    expect(bytes[0]).toBe(0x50);
    const { model, manifest } = parseProject(bytes);
    expect(model).toEqual(m);
    expect(manifest?.format).toBe("nexfem-project");
  });

  it("mở được file JSON trần và báo lỗi file hỏng", () => {
    const json = new TextEncoder().encode(JSON.stringify(sampleModel()));
    expect(parseProject(json).model.name).toBe("Toa_nha_A");
    expect(() => parseProject(new Uint8Array([0x50, 0x4b, 1, 2, 3]))).toThrow(ProjectError);
    expect(() => parseProject(new TextEncoder().encode('{"name":1}'))).toThrow(/không hợp lệ/);
  });
});
