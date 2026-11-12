import { emptyModel } from "@nexfem/model-core";
import { expect, it } from "vitest";
import { visibleObjects } from "../src/filter.ts";
import { buildMomentDiagram, momentDiagramPositions } from "../src/moment.ts";

const model = emptyModel();
model.joints = [
  { id: "a", label: "A", x: 0, y: 0, z: 0 }, { id: "b", label: "B", x: 3, y: 0, z: 0 },
  { id: "c", label: "C", x: 10, y: 0, z: 0 }, { id: "d", label: "D", x: 10, y: 0, z: 4 },
  { id: "e", label: "E", x: 0, y: 1, z: 0 }, { id: "f", label: "F", x: 3, y: 1, z: 4 },
];
model.frames = [
  { id: "h", label: "H", kind: "beam", i: "a", j: "b", section: "s", offsets: { i: 0.2, j: 0.2 } },
  { id: "v", label: "V", kind: "column", i: "c", j: "d", section: "s" },
  { id: "i", label: "I", kind: "brace", i: "e", j: "f", section: "s" },
];
model.stories = [{ id: "base", name: "Base", elevation: 0, height: 0, masterStory: false }];
model.grids = [{ id: "g", name: "Grid", x: [], y: [{ id: "y0", label: "Y0", coord: 0 }] }];
const coordinates = (positions: Float32Array | null) => positions && Array.from(positions, (x) => Number(x.toFixed(5)));
const all = visibleObjects(model, { kind: "3d" });

it("giữ vị trí station ngoài đoạn cứng và dấu M3 theo trục 2", () => {
  const forces = { h: { x: [0.2, 1.5, 2.8], m3: [-30, 0, 20] } };
  const diagram = buildMomentDiagram(model, forces, 0.01)!;
  const expected = [0.2, 0, 0, 0.2, 0, 0.3, 0.2, 0, 0.3, 1.5, 0, 0, 1.5, 0, 0, 2.8, 0, -0.2, 2.8, 0, 0, 2.8, 0, -0.2];
  expect(coordinates(momentDiagramPositions(diagram, all))).toEqual(expected);
  expect(coordinates(momentDiagramPositions(diagram, visibleObjects(model, { kind: "elevation", grid: "g", line: "y0" })))).toEqual(expected);
  expect(momentDiagramPositions(diagram, visibleObjects(model, { kind: "plan", story: "base" }))).toBeNull();
  expect(buildMomentDiagram(model, forces, null)?.scale).toBeCloseTo(0.006, 12);
  expect(buildMomentDiagram(model, { h: { x: [0.2, 3.1], m3: [-30, 20] } }, null)).toBeNull();
});

it("dùng +X cho trục 2 của thanh đứng và chiếu +Z cho thanh nghiêng", () => {
  const diagram = buildMomentDiagram(model, {
    v: { x: [0, 4], m3: [10, -10] },
    i: { x: [0, 5], m3: [10, 10] },
  }, 0.01)!;
  expect(coordinates(momentDiagramPositions(diagram, all))).toEqual([
    10, 0, 0, 9.9, 0, 0, 9.9, 0, 0, 10.1, 0, 4, 10, 0, 4, 10.1, 0, 4,
    0, 1, 0, 0.08, 1, -0.06, 0.08, 1, -0.06, 3.08, 1, 3.94, 3, 1, 4, 3.08, 1, 3.94,
  ]);
});
