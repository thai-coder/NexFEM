import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CommandError,
  CommandStack,
  checkModel,
  createRcFrameModel,
  displayFactor,
  listCommands,
  modelSummary,
  parseModel,
  sampleModel,
  sectionProperties,
  toDisplay,
} from "../src/index.ts";
import { generatedFiles } from "../src/generated.ts";

describe("templates", () => {
  it("dựng khung BTCT đúng số lượng phần tử", () => {
    const m = createRcFrameModel({ xSpans: [6, 6], ySpans: [5], storyHeights: [3, 3] });
    const s = modelSummary(m);
    // 3x2 giao điểm, 3 mức (Base + 2 tầng)
    expect(s.joints).toBe(18);
    expect(s.columns).toBe(12);
    // mỗi tầng: dầm X = 2*2, dầm Y = 3*1
    expect(s.beams).toBe(14);
    expect(s.shells).toBe(4);
    expect(s.stories).toBe(2);
    expect(m.joints.filter((j) => j.restraint).length).toBe(6);
  });

  it("mô hình mẫu hợp lệ theo schema và không có lỗi", () => {
    const m = sampleModel();
    expect(() => parseModel(JSON.parse(JSON.stringify(m)))).not.toThrow();
    expect(checkModel(m).filter((x) => x.level === "error")).toEqual([]);
  });
});

describe("sections", () => {
  it("tiết diện chữ nhật 300x600", () => {
    const p = sectionProperties({ shape: "rect", b: 0.3, h: 0.6 });
    expect(p.A).toBeCloseTo(0.18, 10);
    expect(p.I33).toBeCloseTo(5.4e-3, 10);
    expect(p.I22).toBeCloseTo(1.35e-3, 10);
  });

  it("tiết diện I", () => {
    const p = sectionProperties({ shape: "I", h: 0.3, bf: 0.15, tf: 0.01, tw: 0.006 });
    expect(p.A).toBeCloseTo(2 * 0.15 * 0.01 + 0.28 * 0.006, 10);
    expect(p.I33).toBeGreaterThan(p.I22);
  });
});

describe("units", () => {
  it("đổi ứng suất sang N/mm² (MPa)", () => {
    const u = { force: "N", length: "mm", temperature: "C" } as const;
    expect(toDisplay(30000 * 1000, "stress", u)).toBeCloseTo(30000, 6);
    expect(displayFactor("moment", { force: "kN", length: "m", temperature: "C" })).toBe(1);
  });
});

describe("CommandStack", () => {
  it("chạy lệnh, undo và redo", () => {
    const stack = new CommandStack(sampleModel());
    const before = stack.model;
    const n0 = before.frames.length;
    const r = stack.execute("frame.add", { kind: "brace", from: [0, 0, 0], to: [6, 0, 3.9], section: "sec-beam" });
    expect(r.changed).toBe(true);
    expect(stack.model.frames.length).toBe(n0 + 1);
    expect(stack.model.frames.at(-1)?.label).toBe("D1");
    // Không tạo nút mới vì cả hai đầu trùng nút có sẵn.
    expect(stack.model.joints.length).toBe(before.joints.length);
    expect(stack.undo()).toBe(true);
    expect(stack.model).toEqual(before);
    expect(stack.redo()).toBe(true);
    expect(stack.model.frames.length).toBe(n0 + 1);
  });

  it("tạo nút mới khi đầu thanh không trùng nút nào", () => {
    const stack = new CommandStack(sampleModel());
    const n = stack.model.joints.length;
    stack.execute("frame.add", { kind: "beam", from: [0, 0, 3.9], to: [3, 3, 3.9], section: "sec-beam" });
    expect(stack.model.joints.length).toBe(n + 1);
    expect(stack.model.joints.at(-1)?.label).toBe(String(n + 1));
  });

  it("từ chối tham số sai và lệnh không tồn tại", () => {
    const stack = new CommandStack(sampleModel());
    expect(() => stack.execute("frame.add", { kind: "beam" })).toThrow(CommandError);
    expect(() => stack.execute("khong.co", {})).toThrow(/Không có lệnh/);
    expect(() => stack.execute("frame.add", { kind: "beam", from: [0, 0, 0], to: [0, 0, 0], section: "sec-beam" })).toThrow(
      /chiều dài bằng 0/,
    );
    expect(stack.canUndo).toBe(false);
  });

  it("xoá thanh nhưng giữ nút còn được dùng", () => {
    const stack = new CommandStack(sampleModel());
    const f = stack.model.frames[0]!;
    stack.execute("objects.delete", { ids: [f.id, f.i, f.j] });
    // Nút chân cột không còn ai dùng thì bị xoá; nút đầu cột còn dầm dùng thì giữ lại.
    expect(stack.model.joints.find((x) => x.id === f.i)).toBeUndefined();
    expect(stack.model.frames.find((x) => x.id === f.id)).toBeUndefined();
    expect(stack.model.joints.find((x) => x.id === f.j)).toBeDefined();
  });

  it("liệt kê lệnh kèm JSON Schema cho API/MCP", () => {
    const list = listCommands();
    const add = list.find((c) => c.name === "frame.add");
    expect(add?.mutates).toBe(true);
    expect(add?.argsSchema).toMatchObject({ type: "object" });
  });
});

describe("validation", () => {
  it("phát hiện thiếu gối và thanh trùng", () => {
    const m = structuredClone(sampleModel());
    for (const j of m.joints) delete j.restraint;
    m.frames.push({ ...m.frames[0]!, id: "dup", label: "C999" });
    const codes = checkModel(m).map((x) => x.code);
    expect(codes).toContain("no_supports");
    expect(codes).toContain("duplicate_frame");
  });
});

describe("generated files", () => {
  it("đã được sinh lại (chạy `pnpm gen` nếu test này lỗi)", () => {
    for (const [rel, content] of Object.entries(generatedFiles())) {
      const path = fileURLToPath(new URL(`../${rel}`, import.meta.url));
      expect(readFileSync(path, "utf8"), rel).toBe(content);
    }
  });
});
