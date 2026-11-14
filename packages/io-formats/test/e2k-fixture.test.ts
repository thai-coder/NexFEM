import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkModel } from "@nexfem/model-core";
import { describe, expect, it } from "vitest";
import { decodeE2k, e2kSection, importE2k, parseE2k } from "../src/index.ts";

/** File ETABS 23.2.0 thật, chủ dự án cho phép công khai (tests/fixtures/csi/etabs/README.md). */
const FIXTURE = fileURLToPath(new URL("../../../tests/fixtures/csi/etabs/23217_SMFs 3D model_updated v4.e2k", import.meta.url));
const bytes = readFileSync(FIXTURE);
const text = decodeE2k(bytes);
const IN = 0.0254;
const LB = 4.4482216152605e-3;

describe("file mẫu ETABS 23.2.0: cú pháp", () => {
  it("file giữ nguyên từng byte (CRLF, SHA-256 như README)", () => {
    expect(bytes.length).toBe(350310);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("01d6753b2894b657e78d2a4fc3b4842f95e8c85d384a30f90fc4c458d965f431");
    expect(text).toContain("ρ"); // ký tự không ASCII trong tên tổ hợp, giải mã UTF-8
  });

  it("số bản ghi khớp ghi chú tiếp nhận (docs/ETABS_SAMPLE_INTAKE_2026-11-10.md)", () => {
    const f = parseE2k(text);
    // 51 dòng "$": bỏ dòng "$ File …" và "$ END OF MODEL FILE".
    expect(f.sections.size).toBe(49);
    const uniq = (name: string) => new Set(e2kSection(f, name).map((r) => r.tokens[1]!.text)).size;
    expect(uniq("POINT COORDINATES")).toBe(546);
    const lines = e2kSection(f, "LINE CONNECTIVITIES");
    expect(lines.length).toBe(322);
    const kinds: Record<string, number> = {};
    for (const r of lines) kinds[r.tokens[2]!.text] = (kinds[r.tokens[2]!.text] ?? 0) + 1;
    expect(kinds).toEqual({ BEAM: 244, COLUMN: 54, BRACE: 24 });
    expect(e2kSection(f, "AREA CONNECTIVITIES").length).toBe(29);
    expect(uniq("FRAME SECTIONS")).toBe(305);
    expect(uniq("MATERIAL PROPERTIES")).toBe(9);
    expect(e2kSection(f, "LOAD PATTERNS").length).toBe(11);
    expect(uniq("LOAD CASES")).toBe(12);
    expect(uniq("LOAD COMBINATIONS")).toBe(87);
    expect(e2kSection(f, "LOAD COMBINATIONS").length).toBe(837);
    expect(e2kSection(f, "POINT OBJECT LOADS").length).toBe(31);
    const frameLoads = e2kSection(f, "FRAME OBJECT LOADS");
    expect(frameLoads.length).toBe(24);
    expect(frameLoads.filter((r) => r.tokens.some((t) => t.text === "UNIFF")).length).toBe(14);
    expect(frameLoads.filter((r) => r.tokens.some((t) => t.text === "TRAPF")).length).toBe(10);
    expect(e2kSection(f, "SHELL OBJECT LOADS").length).toBe(16);
  });

  it("chuỗi ngoặc kép dính liền từ khoá sau vẫn tách đúng", () => {
    const f = parseE2k(text);
    const c1 = e2kSection(f, "LINE ASSIGNS").find((r) => r.tokens[1]!.text === "C1" && r.tokens.some((t) => t.text === "RELEASE"))!;
    const i = c1.tokens.findIndex((t) => t.text === "RELEASE");
    expect(c1.tokens[i + 1]).toEqual({ text: "M2I M3I", quoted: true });
    expect(c1.tokens[i + 2]).toEqual({ text: "LENGTHOFFI", quoted: false });
  });
});

describe("file mẫu ETABS 23.2.0: nhập vào NexFEM", () => {
  const { model, report } = importE2k(text);
  const diag = (code: string) => report.diagnostics.filter((x) => x.code === code);
  const total = (code: string) => diag(code).reduce((s, x) => s + x.count, 0);

  it("đọc chương trình, đơn vị và đổi sang SI", () => {
    expect(report.program).toBe("ETABS");
    expect(report.version).toBe("23.2.0");
    expect(report.units).toEqual({ force: "LB", length: "IN", temperature: "C" });
    expect(model.units).toEqual({ force: "kN", length: "m", temperature: "C" });
    expect(model.name).toBe("23217_SMFs 3D model_updated v4");
  });

  it("tầng (ghi từ trên xuống) và lưới trục", () => {
    expect(model.stories.map((s) => [s.name, s.elevation, s.height])).toEqual([
      ["Base", 0, 0],
      ["Story1", 0.3048, 0.3048], // 12 in
    ]);
    const g = model.grids[0]!;
    expect(g.x.map((l) => [l.label, l.coord])).toEqual([["A", 0], ["B", 18.288]]);
    expect(g.y.map((l) => l.label)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(g.y.at(-1)!.coord).toBeCloseTo(1626 * IN, 9);
  });

  it("vật liệu: E, trọng lượng riêng, cường độ theo kN, m", () => {
    const a992 = model.materials.find((m) => m.name === "A992Fy50")!;
    expect(a992.type).toBe("steel");
    expect(a992.E).toBeCloseTo((29000000 * LB) / IN ** 2, 0); // ≈ 1,9995e8 kN/m²
    expect(a992.gamma).toBeCloseTo((0.2835648 * LB) / IN ** 3, 6); // ≈ 76,97 kN/m³
    expect(a992.strength!).toBeCloseTo((50000 * LB) / IN ** 2, 0); // ≈ 344,7 MPa
    expect(model.materials.find((m) => m.name === "4000Psi")!.type).toBe("concrete");
  });

  it("tiết diện: chữ I, ống hộp, bê tông chữ nhật; chữ L và General không hỗ trợ", () => {
    const sec = (name: string) => model.frameSections.find((s) => s.name === name)!;
    expect(sec("W8X18").geometry).toEqual({ shape: "I", h: 8.14 * IN, bf: 5.25 * IN, tf: 0.33 * IN, tw: 0.23 * IN });
    expect(sec("HSS10X6X1/2").geometry).toEqual({ shape: "box", h: 10 * IN, b: 6 * IN, t: 0.465 * IN });
    expect(sec("GB48x60").geometry).toEqual({ shape: "rect", b: 48 * IN, h: 60 * IN });
    expect(model.frameSections.length).toBe(305 - 3 - 8);
    expect(total("section_unsupported")).toBe(11);
    expect(diag("section_unsupported").map((x) => x.params.shape).sort()).toEqual(["General", "Steel Angle"]);
    expect(diag("section_filled_tube")[0]!.objects).toEqual(["HSS16x16x5/8 with concrete"]);
  });

  it("cao độ nút = cao độ tầng − DZ: mọi cột đứng thẳng và đi từ dưới lên", () => {
    const joint = new Map(model.joints.map((j) => [j.id, j]));
    const cols = model.frames.filter((f) => f.kind === "column");
    expect(cols.length).toBe(54);
    for (const c of cols) {
      const a = joint.get(c.i)!;
      const b = joint.get(c.j)!;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(1e-9);
      expect(b.z).toBeGreaterThan(a.z);
    }
    // C6: điểm 9 (DZ −234) → điểm 7 (DZ −486) ở Story1 (cao độ 12 in).
    const c6 = cols.find((c) => c.label === "C6")!;
    expect([joint.get(c6.i)!.x, joint.get(c6.i)!.y, joint.get(c6.i)!.z]).toEqual([0, 300 * IN, (12 + 234) * IN].map((v) => Number(v.toPrecision(12))));
    expect(joint.get(c6.j)!.z).toBeCloseTo((12 + 486) * IN, 12);
    // C1 có số tầng 1: đầu i ở tầng Base.
    const c1 = cols.find((c) => c.label === "C1")!;
    expect(joint.get(c1.i)!.z).toBe(0);
    expect(c1.releases?.i).toEqual([false, false, false, false, true, true]);
  });

  it("thanh: 244 dầm + 54 cột; 24 giằng tiết diện chữ L bị bỏ và được liệt kê", () => {
    expect(model.frames.filter((f) => f.kind === "beam").length).toBe(244);
    expect(model.frames.filter((f) => f.kind === "brace").length).toBe(0);
    expect(total("frame_section_unavailable")).toBe(24);
    expect(report.counts.frames).toEqual({ source: 322, imported: 298 });
    const pinned = model.frames.find((f) => f.label === "B8")!;
    expect(pinned.releases).toEqual({ i: [false, false, false, false, true, true], j: [false, false, false, false, true, true] });
  });

  it("sàn: 29 sàn với tiết diện đã định nghĩa", () => {
    expect(model.shells.length).toBe(29);
    expect(model.shellSections.map((s) => s.name)).toEqual(["Shell none_Slab", "30in footing", "Shell none_Wall"]);
    expect(diag("shell_section_unsupported")[0]!.objects).toEqual(["Deck1"]);
  });

  it("tải: mẫu, tải thanh (hình thang giữ hợp lực), tải sàn; tải tập trung tại nút được báo là không nhập", () => {
    expect(model.loadPatterns.map((p) => p.name)).toEqual(["CDL", "SDL", "LL", "Lr", "WX", "WY", "EX", "EY", "S", "R", "H"]);
    expect(model.loadPatterns[0]!.selfWeight).toBe(1);
    const frameId = new Map(model.frames.map((f) => [f.label, f.id]));
    const load = (label: string) => model.frameLoads.find((l) => l.frame === frameId.get(label))!;
    expect(load("B93").value).toBeCloseTo((29.75 * LB) / IN, 9);
    expect(load("B2").value).toBeCloseTo((21.25 * (0.9916667 - 0.008333334) * LB) / IN, 9);
    expect(model.frameLoads.length).toBe(24);
    expect(total("line_load_approximated")).toBe(9);
    // 0,6944444 psi = 100 psf ≈ 4,788 kN/m².
    expect(model.shellLoads[0]!.value).toBeCloseTo(4.788, 3);
    expect(model.shellLoads.length).toBe(16);
    expect(total("point_loads_unsupported")).toBe(31);
    expect(report.counts.pointLoads).toEqual({ source: 31, imported: 0 });
  });

  it("trường hợp tải và 87 tổ hợp, kể cả tổ hợp lồng tổ hợp", () => {
    expect(model.loadCases.length).toBe(12);
    expect(model.loadCases.find((c) => c.name === "Modal")!.type).toBe("modal");
    expect(model.loadCases.find((c) => c.name === "SDL")!.loads).toEqual([{ pattern: model.loadPatterns[1]!.id, factor: 1 }]);
    expect(model.combos.length).toBe(87);
    const comboIds = new Set(model.combos.map((c) => c.id));
    expect(model.combos.some((c) => c.items.some((i) => comboIds.has(i.case)))).toBe(true);
    expect(total("combo_item_missing")).toBe(0);
  });

  it("báo rõ các thứ chưa hỗ trợ: lò xo, điểm chèn, không có gối; góc xoay trục ANG được nhập", () => {
    expect(total("frame_spring_unsupported")).toBe(24);
    expect(total("area_spring_unsupported")).toBe(21);
    expect(total("frame_angle_ignored")).toBe(0);
    expect(total("frame_angle_imported")).toBe(34);
    // 34 cột xoay 90° (ANG 90): trục khoẻ quay sang phương kia.
    const rotated = model.frames.filter((f) => f.angle !== undefined);
    expect(rotated.length).toBe(34);
    expect(rotated.every((f) => f.kind === "column" && f.angle === 90)).toBe(true);
    expect(total("frame_cardinal_ignored")).toBe(60);
    expect(total("no_supports_imported")).toBe(1);
    expect(report.diagnostics[0]!.level).toBe("error");
  });

  it("mô hình hợp lệ theo schema; kiểm tra mô hình chỉ còn lỗi thiếu gối", () => {
    const errors = checkModel(model).filter((i) => i.level === "error").map((i) => i.code);
    expect([...new Set(errors)]).toEqual(["no_supports"]);
  });

  it("nhập hai lần cho cùng kết quả (ổn định để so sánh và kiểm thử)", () => {
    expect(JSON.stringify(importE2k(text))).toBe(JSON.stringify({ model, report }));
  });
});
