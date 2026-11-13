import { emptyModel } from "@nexfem/model-core";
import { expect, it } from "vitest";
import { buildDeformedFrames, projectDeformedFrames } from "../src/deformation.ts";
import { visibleObjects } from "../src/filter.ts";

const model = emptyModel();
model.stories = [
  { id: "lower", name: "Lower", elevation: 4, height: 4, masterStory: false },
  { id: "upper", name: "Upper", elevation: 8, height: 4, masterStory: false },
];
model.grids = [{ id: "g", name: "Grid", x: [{ id: "gx", label: "X", coord: 10 }], y: [{ id: "gy", label: "Y", coord: 20 }] }];
model.joints = [
  { id: "a", label: "A", x: 10, y: 20, z: 4 },
  { id: "b", label: "B", x: 13, y: 20, z: 4 },
  { id: "c", label: "C", x: 10, y: 23, z: 4 },
  { id: "d", label: "D", x: 10, y: 20, z: 8 },
  { id: "e", label: "E", x: 13, y: 20, z: 8 },
];
model.frames = [
  { id: "ab", label: "AB", kind: "beam", i: "a", j: "b", section: "s" },
  { id: "ac", label: "AC", kind: "beam", i: "a", j: "c", section: "s" },
  { id: "de", label: "DE", kind: "beam", i: "d", j: "e", section: "s" },
];

const displacements = { a: [1, 2, 3], b: [4, 5, 6], c: [-1, 3, 4], d: [0, 0, -2], e: [0, 0, -2] };

it("lọc Plan theo tầng gốc dù một thanh tầng khác dịch chuyển xuống đúng mặt bằng", () => {
  const shape = buildDeformedFrames(model, displacements, 2)!;
  const original = shape.positions.slice();
  const lower = visibleObjects(model, { kind: "plan", story: "lower" });
  const upper = visibleObjects(model, { kind: "plan", story: "upper" });

  expect(projectDeformedFrames(shape, lower)).toEqual(new Float32Array([12, 24, 4, 21, 30, 4, 12, 24, 4, 8, 29, 4]));
  expect(projectDeformedFrames(shape, upper)).toEqual(new Float32Array([10, 20, 8, 13, 20, 8]));
  expect(shape.positions).toEqual(original);
});

it("chiếu mặt đứng theo trục X hoặc Y và bỏ thanh thiếu chuyển vị đầu nút", () => {
  const shape = buildDeformedFrames(model, displacements, 2)!;
  const xView = visibleObjects(model, { kind: "elevation", grid: "g", line: "gx" });
  const yView = visibleObjects(model, { kind: "elevation", grid: "g", line: "gy" });

  expect(projectDeformedFrames(shape, xView)).toEqual(new Float32Array([10, 24, 10, 10, 29, 12]));
  expect(projectDeformedFrames(shape, yView)).toEqual(new Float32Array([12, 20, 10, 21, 20, 16, 10, 20, 4, 13, 20, 4]));
  expect(projectDeformedFrames(buildDeformedFrames(model, { a: displacements.a, b: displacements.b }, 2)!, xView)).toBeNull();
});
