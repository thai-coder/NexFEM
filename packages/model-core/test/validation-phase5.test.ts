import { describe, expect, it } from "vitest";
import { checkModel, sampleModel, type Model } from "../src/index.ts";

const codes = (m: Model) => checkModel(m).filter((x) => x.level === "error").map((x) => x.code);

describe("GĐ5 model validation regression", () => {
  it("phát hiện tải thanh mồ côi và mẫu tải không tồn tại", () => {
    const m = structuredClone(sampleModel());
    m.frameLoads.push({ id: "bad-frame", frame: "__missing__", pattern: m.loadPatterns[0]!.id, kind: "point", direction: "gravity", value: 10, at: 0.5 });
    expect(codes(m)).toContain("missing_load_target");
    m.frameLoads[0]!.frame = m.frames[0]!.id;
    m.frameLoads[0]!.pattern = "__missing__";
    expect(codes(m)).toContain("missing_load_pattern");
  });

  it("phát hiện tải sàn mồ côi và tải case thiếu pattern", () => {
    const m = structuredClone(sampleModel());
    m.shellLoads.push({ id: "bad-shell", shell: "__missing__", pattern: m.loadPatterns[0]!.id, direction: "gravity", value: 5 });
    m.loadCases[0]!.loads[0]!.pattern = "__missing__";
    const found = codes(m);
    expect(found).toContain("missing_load_target");
    expect(found).toContain("missing_load_pattern");
  });

  it("phát hiện tổ hợp tham chiếu sai và chu trình A-B-A", () => {
    const m = structuredClone(sampleModel());
    m.combos.push({ id: "bad-combo", name: "Bad", type: "linearAdd", items: [{ case: "__missing__", factor: 1 }] });
    expect(codes(m)).toContain("missing_load_case");
    m.combos = [
      { id: "a", name: "A", type: "linearAdd", items: [{ case: "b", factor: 1 }] },
      { id: "b", name: "B", type: "linearAdd", items: [{ case: "a", factor: 1 }] },
    ];
    expect(codes(m).filter((c) => c === "invalid_combo_cycle")).toHaveLength(2);
  });

  it("chặn tiết diện rỗng hoặc bị xuyên chiều dày và releases bất ổn", () => {
    const m = structuredClone(sampleModel());
    m.frameSections[0]!.geometry = { shape: "box", b: 0.2, h: 0.3, t: 0.11 };
    m.frames[0]!.releases = { i: [true, false, false, false, false, false], j: [true, false, false, false, false, false] };
    expect(codes(m)).toContain("invalid_section");
    expect(codes(m)).toContain("invalid_releases");
  });

  it("mô hình mẫu không có lỗi kiểm tra", () => {
    expect(codes(sampleModel())).toEqual([]);
  });
});
