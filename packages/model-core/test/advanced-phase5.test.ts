import { describe, expect, it } from "vitest";
import { CommandStack, checkModel, parseModel, sampleModel } from "../src/index.ts";

describe("Phase 5B model and commands", () => {
  it("offsets: valid, invalid, clear and undo; shear areas persist", () => {
    const s = new CommandStack(sampleModel());
    const f = s.model.frames.find((x) => x.kind === "beam")!;
    s.execute("frame.assignOffsets", { frames: [f.id], offsets: { i: 0.2, j: 0.3 } });
    expect(s.model.frames.find((x) => x.id === f.id)?.offsets).toEqual({ i: 0.2, j: 0.3 });
    expect(() => s.execute("frame.assignOffsets", { frames: [f.id], offsets: { i: 1e5, j: 0 } })).toThrow(/vùng cứng/);
    const sec = s.model.frameSections[0]!;
    s.execute("definition.upsert", { collection: "frameSections", item: { ...sec, shearAreas: { a2: 0.1, a3: 0.1 } } });
    expect(parseModel(JSON.parse(JSON.stringify(s.model)))).toEqual(s.model);
    s.undo();
    expect(s.model.frameSections[0]?.shearAreas).toBeUndefined();
    s.undo();
    expect(s.model.frames.find((x) => x.id === f.id)?.offsets).toBeUndefined();
  });

  it("diaphragm: assign, validate membership, protect joints, remove", () => {
    const s = new CommandStack(sampleModel());
    const [master, slave] = s.model.joints.filter((j) => j.z > 0);
    s.execute("diaphragm.set", { id: "D1", name: "D1", master: master!.id, slaves: [slave!.id] });
    expect(s.model.diaphragms).toHaveLength(1);
    expect(checkModel(s.model).filter((m) => m.level === "error")).toEqual([]);
    expect(() => s.execute("objects.delete", { ids: [slave!.id] })).toThrow(/diaphragm/);
    expect(() => s.execute("diaphragm.set", { id: "D2", name: "D2", master: master!.id, slaves: [slave!.id] })).toThrow(/diaphragm khác/);
    s.execute("diaphragm.remove", { id: "D1" });
    expect(s.model.diaphragms).toEqual([]);
  });

  it("checkModel rejects impossible diaphragm and end offsets", () => {
    const m = structuredClone(sampleModel());
    m.diaphragms = [{ id: "wrong", name: "wrong", master: m.joints.find((j) => j.z > 0)!.id,
      slaves: [m.joints.find((j) => j.z === 0)!.id] }];
    m.frames[0]!.offsets = { i: 1e4, j: 1e4 };
    const errors = checkModel(m).filter((x) => x.level === "error").map((x) => x.code);
    expect(errors).toContain("invalid_diaphragm");
    expect(errors).toContain("invalid_offsets");
  });
});
