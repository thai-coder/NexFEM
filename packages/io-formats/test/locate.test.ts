import { describe, expect, it } from "vitest";
import { cornerAreas, meshedNodeAreas as tryMesh } from "../src/csi/locate.ts";

/** Chia tấm tại nút nằm bên trong để quy lò xo nền (dữ liệu tự tạo, chỉ để kiểm tra quy tắc). */
const P = (id: string, x: number, y: number, z = 0) => ({ id, x, y, z });
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
const rect = [P("a", 0, 0), P("b", 4, 0), P("c", 4, 2), P("d", 0, 2)];
function meshedNodeAreas(...args: Parameters<typeof tryMesh>) {
  const shares = tryMesh(...args);
  expect(shares).not.toBeNull();
  return shares!;
}

describe("meshedNodeAreas", () => {
  it("không có nút bên trong: giống cornerAreas (A/4 mỗi góc hình chữ nhật)", () => {
    const m = meshedNodeAreas(rect, [], 1e-6);
    expect([...m.values()]).toEqual(cornerAreas(rect));
    expect(sum(m)).toBeCloseTo(8, 12);
  });

  it("một nút giữa tấm nhận 1/3 diện tích; tổng diện tích giữ nguyên", () => {
    const m = meshedNodeAreas(rect, [P("col", 2, 1)], 1e-6);
    expect(m.get("col")).toBeCloseTo(8 / 3, 12);
    expect(sum(m)).toBeCloseTo(8, 12);
    expect(m.get("a")! + m.get("b")! + m.get("c")! + m.get("d")!).toBeCloseTo(16 / 3, 12);
  });

  it("nhiều nút bên trong, nút lệch tâm và nút trên cạnh: tổng luôn bằng diện tích tấm, mỗi nút một phần dương", () => {
    const m = meshedNodeAreas(rect, [P("p", 1, 0.5), P("q", 3.2, 1.4), P("e", 2, 0)], 1e-6);
    expect(sum(m)).toBeCloseTo(8, 12);
    for (const id of ["p", "q", "e"]) expect(m.get(id)).toBeGreaterThan(0);
  });

  it("nút lệch mặt phẳng (đỉnh cột phía trên) và nút ngoài tấm không bị ghép", () => {
    const m = meshedNodeAreas(rect, [P("top", 2, 1, 3), P("near", 2, 1, 0.01), P("out", 5, 1)], 1e-3);
    expect(m.has("top")).toBe(false);
    expect(m.has("near")).toBe(false);
    expect(m.has("out")).toBe(false);
    expect(sum(m)).toBeCloseTo(8, 12);
  });

  it("góc tấm trùng ứng viên không bị tính hai lần", () => {
    const m = meshedNodeAreas(rect, [P("a", 0, 0)], 1e-6);
    expect([...m.keys()].sort()).toEqual(["a", "b", "c", "d"]);
    expect(sum(m)).toBeCloseTo(8, 12);
  });

  it("không cấp lò xo cho nút nằm sát phía ngoài mép", () => {
    const m = meshedNodeAreas(rect, [P("out", 2, -0.0009)], 1e-3);
    expect(m.has("out")).toBe(false);
    expect(sum(m)).toBeCloseTo(8, 12);
  });

  it("phân bổ cùng diện tích khi đổi thứ tự nút ở mép và nút bên trong", () => {
    const nodes = [P("edge", 2, 0), P("inside", 1, 0.5)];
    const m = meshedNodeAreas(rect, nodes, 1e-6);
    expect(m).toEqual(meshedNodeAreas(rect, [...nodes].reverse(), 1e-6));
    expect(m.get("edge")).toBeGreaterThan(0);
    expect(m.get("inside")).toBeGreaterThan(0);
    expect(sum(m)).toBeCloseTo(8, 12);
  });

  it("không cắt tai qua đỉnh lõm của tấm chữ L", () => {
    const L = [P("a", 0, 0), P("b", 2, 0), P("c", 2, 1), P("d", 1, 1), P("e", 1, 2), P("f", 0, 2)];
    for (const polygon of [L, [...L].reverse()]) {
      const m = meshedNodeAreas(polygon, [P("inside", 0.5, 0.5)], 1e-6);
      expect(sum(m)).toBeCloseTo(3, 12);
      expect(m.get("inside")).toBeGreaterThan(0);
    }
  });

  it("từ chối tấm suy biến để bộ nhập có thể báo rõ khi quy lò xo về góc", () => {
    expect(tryMesh([P("a", 0, 0), P("b", 1, 0), P("c", 2, 0)], [], 1e-6)).toBeNull();
  });

  it("tấm lõm (chữ L) và tấm nghiêng: tổng diện tích đúng", () => {
    const L = [P("1", 0, 0), P("2", 4, 0), P("3", 4, 1), P("4", 1, 1), P("5", 1, 3), P("6", 0, 3)];
    const m = meshedNodeAreas(L, [P("in", 0.5, 2)], 1e-6);
    expect(sum(m)).toBeCloseTo(4 + 2, 12);
    expect(m.get("in")).toBeGreaterThan(0);
    const tilt = rect.map((p) => ({ ...p, z: p.x * 0.75 })); // dốc 3/4: diện tích thật = 8 × 1.25
    const t = meshedNodeAreas(tilt, [P("mid", 2, 1, 1.5)], 1e-6);
    expect(sum(t)).toBeCloseTo(10, 9);
    expect(t.get("mid")).toBeCloseTo(10 / 3, 9);
  });
});
