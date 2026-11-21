import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeE2k, importE2k, tokenizeE2kLine } from "../src/index.ts";

/**
 * Dữ liệu TỰ TẠO để kiểm tra các nhánh mã mà file mẫu ETABS không có (gối, nhiều tầng, gộp nút, lỗi đơn vị).
 * Cú pháp RESTRAINT lấy theo tài liệu ETABS, CHƯA được kiểm chứng bằng file ETABS thật.
 */
const SMALL = [
  "$ PROGRAM INFORMATION",
  '  PROGRAM  "ETABS"  VERSION "23.2.0"',
  "$ CONTROLS",
  '  UNITS  "KN"  "M"  "C"',
  "  PREFERENCE  MERGETOL 0.001",
  "$ STORIES - IN SEQUENCE FROM TOP",
  '  STORY "S2"  HEIGHT 3',
  '  STORY "S1"  HEIGHT 4',
  '  STORY "Base"  ELEV 0',
  "$ MATERIAL PROPERTIES",
  '  MATERIAL  "C30"    TYPE "Concrete"    WEIGHTPERVOLUME 25',
  '  MATERIAL  "C30"    SYMTYPE "Isotropic"  E 30000000  U 0.2',
  "$ FRAME SECTIONS",
  '  FRAMESECTION  "C400"  MATERIAL "C30"  SHAPE "Concrete Rectangular"  D 0.4 B 0.4',
  "$ POINT COORDINATES",
  '  POINT "1"  0 0',
  '  POINT "2"  6 0',
  '  POINT "3"  6.0005 0',
  "$ LINE CONNECTIVITIES",
  '  LINE  "C1"  COLUMN  "1"  "1"  1',
  '  LINE  "B1"  BEAM  "1"  "2"  0',
  '  LINE  "B2"  BEAM  "3"  "2"  0',
  "$ POINT ASSIGNS",
  '  POINTASSIGN  "1"  "Base"  RESTRAINT "UX UY UZ RX RY RZ"',
  "$ LINE ASSIGNS",
  '  LINEASSIGN  "C1"  "S1"  SECTION "C400"',
  '  LINEASSIGN  "C1"  "S2"  SECTION "C400"',
  '  LINEASSIGN  "B1"  "S1"  SECTION "C400"',
  '  LINEASSIGN  "B2"  "S1"  SECTION "C400"',
  "$ END OF MODEL FILE",
].join("\n");

describe("tách token", () => {
  it("ngoặc kép, số mũ, chuỗi dính liền", () => {
    expect(tokenizeE2kLine('  A "x y"B 1.2E-05 -0').map((t) => t.text)).toEqual(["A", "x y", "B", "1.2E-05", "-0"]);
  });
});

describe("nhập dữ liệu tự tạo", () => {
  const { model, report } = importE2k(SMALL);

  it("cột gán ở hai tầng thành hai thanh có nhãn kèm tầng; cao độ cộng dồn từ Base", () => {
    expect(model.stories.map((s) => [s.name, s.elevation])).toEqual([["Base", 0], ["S1", 4], ["S2", 7]]);
    expect(model.frames.filter((f) => f.kind === "column").map((f) => f.label)).toEqual(["C1@S1", "C1@S2"]);
  });

  it("gối từ RESTRAINT; điểm dùng ở nhiều tầng có nhãn kèm tầng", () => {
    const base = model.joints.find((j) => j.label === "1@Base")!;
    expect(base.restraint).toEqual([true, true, true, true, true, true]);
    expect(report.diagnostics.some((d) => d.code === "no_supports_imported")).toBe(false);
  });

  it("gộp nút trong dung sai MERGETOL: điểm 3 cách điểm 2 nửa milimét nhưng dung sai 1 mm", () => {
    // B2 nối 3 → 2; sau khi gộp hai đầu trùng nhau nên bị loại và được báo.
    expect(report.diagnostics.find((d) => d.code === "joints_merged")!.params.count).toBe(1);
    expect(report.diagnostics.find((d) => d.code === "frame_zero_length")!.objects).toEqual(["B2"]);
    expect(model.frames.map((f) => f.label)).not.toContain("B2");
  });

  it("thiếu đơn vị hoặc đơn vị lạ: không đổi số, trả về mô hình trống và lỗi", () => {
    const bad = importE2k(SMALL.replace('UNITS  "KN"  "M"  "C"', 'UNITS  "FOO"  "M"  "C"'));
    expect(bad.model.joints).toEqual([]);
    expect(bad.report.diagnostics.map((d) => d.code)).toEqual(expect.arrayContaining(["unknown_units", "missing_units"]));
  });

  it("tải thanh theo trục địa phương 1, 2 và phương toàn cục đều được nhập (trục theo quy ước CSI)", () => {
    const withLoads = SMALL.replace(
      "$ END OF MODEL FILE",
      [
        "$ LOAD PATTERNS",
        '  LOADPATTERN "D"  TYPE  "Dead"  SELFWEIGHT  0',
        "$ FRAME OBJECT LOADS",
        '  LINELOAD  "B1"  "S1"  TYPE "UNIFF"  DIR "2"  LC "D"  FVAL 1',
        '  LINELOAD  "B1"  "S1"  TYPE "UNIFF"  DIR "1"  LC "D"  FVAL 2',
        '  LINELOAD  "B1"  "S1"  TYPE "UNIFF"  DIR "X"  LC "D"  FVAL 3',
        "$ END OF MODEL FILE",
      ].join("\n"),
    );
    const r = importE2k(withLoads);
    expect(r.model.frameLoads.map((l) => [l.direction, l.value])).toEqual([["local2", 1], ["localX", 2], ["globalX", 3]]);
    expect(r.report.diagnostics.find((d) => d.code === "line_load_local_axis_note")).toMatchObject({ level: "info", count: 1 });
  });

  it("giải mã Windows-1252 khi file không phải UTF-8", () => {
    expect(decodeE2k(new Uint8Array([0x24, 0x20, 0xb0]))).toBe("$ °");
  });
});

describe("đầu vào ETABS chưa kiểm chứng", () => {
  it("thuộc tính mẫu tải chưa kiểm chứng không bị bỏ âm thầm", () => {
    const r = importE2k(SMALL.replace('$ END OF MODEL FILE', '$ LOAD PATTERNS\n  LOADPATTERN "W" TYPE "Wind" SELFWEIGHT 0 AUTO "ASCE"\n$ END OF MODEL FILE'));
    expect(r.report.diagnostics).toContainEqual(expect.objectContaining({level:'error',code:'pattern_property_unsupported',params:{key:'AUTO'}}));
    expect(r.report.blocked).toBe(true);
  });
  it("thiếu mẫu tải và thành phần tổ hợp tạo lỗi chặn", () => {
    const extra = ['$ LOAD CASES', '  LOADCASE "C" TYPE "Linear Static" LOADPAT "MISSING" SF 1', '$ LOAD COMBINATIONS', '  LOADCOMBO "CO" TYPE "Linear Add" LOADCASE "MISSING_CASE" SF 1', '$ END OF MODEL FILE'].join('\n');
    const r = importE2k(SMALL.replace('$ END OF MODEL FILE', extra));
    expect(r.report.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({level:'error',code:'case_item_missing'}), expect.objectContaining({level:'error',code:'combo_item_missing'})]));
    expect(r.report.blocked).toBe(true);
  });
  it("thiếu hệ số không được bỏ qua tham chiếu", () => {
    const extra = ['$ LOAD CASES', '  LOADCASE "C" TYPE "Linear Static" LOADPAT "MISSING"', '$ LOAD COMBINATIONS', '  LOADCOMBO "CO" TYPE "Linear Add" LOADCASE "MISSING_CASE"', '$ END OF MODEL FILE'].join('\n');
    const r = importE2k(SMALL.replace('$ END OF MODEL FILE', extra));
    expect(r.report.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({level:'error',code:'case_item_missing'}), expect.objectContaining({level:'error',code:'combo_item_missing'})]));
  });
  it("phần chưa biết chặn; metadata cho phép không chặn", () => {
    const r = importE2k(SMALL.replace('$ END OF MODEL FILE', '$ UNEXPECTED FORCES DATA\n  VALUE 1\n$ PROJECT INFORMATION\n  INFO "x"\n$ END OF MODEL FILE'));
    expect(r.report.diagnostics).toContainEqual(expect.objectContaining({level:'error',code:'section_unverified',params:{section:'UNEXPECTED FORCES DATA',records:1}}));
    expect(r.report.diagnostics).toContainEqual(expect.objectContaining({level:'info',code:'section_ignored',params:{section:'PROJECT INFORMATION',records:1}}));
    expect(r.report.blocked).toBe(true);
  });
});

describe("mô men ETABS tại điểm riêng nằm giữa thanh", () => {
  const input = readFileSync(new URL("../../../tests/fixtures/csi/synthetic/etabs-interior-moment.e2k", import.meta.url), "utf8");

  it("file được hỗ trợ không bị chặn và metadata cho phép giữ trạng thái không chặn", () => {
    expect(importE2k(input).report.blocked).toBe(false);
    expect(importE2k(input.replace('$ END OF MODEL FILE', '$ PROJECT INFORMATION\n  INFO "x"\n$ END OF MODEL FILE')).report.blocked).toBe(false);
  });

  it("tạo một nút dùng chung, chuyển đủ thành phần tải và giữ nhả tại đầu ngoài", () => {
    const source = input
      .replace('AUTOMESH "YES"', 'AUTOMESH "YES" RELEASE "M3I M2J"')
      .replace('$ POINT OBJECT LOADS', '$ FRAME OBJECT LOADS\n  LINELOAD "B1" "S1" TYPE "UNIFF" DIR "Z" LC "MOMENT" FVAL -2\n$ POINT OBJECT LOADS')
      .replace('MY 12', 'FX 1 FY 2 FZ 3 MX 4 MY 12 MZ 6\n  POINTLOAD "M" "S1" TYPE "FORCE" LC "MOMENT" FZ -5');
    const { model, report } = importE2k(source);
    const [left, right] = model.frames;
    const [a, b, middle] = model.joints;
    expect(model.frames).toHaveLength(2);
    expect(model.joints).toHaveLength(3);
    expect(middle).toMatchObject({ label: "M@S1", x: 3, y: 0, z: 4 });
    expect(left).toMatchObject({ label: "B1-1", i: a!.id, j: middle!.id,
      releases: { i: [false, false, false, false, false, true], j: Array(6).fill(false) } });
    expect(right).toMatchObject({ label: "B1-2", i: middle!.id, j: b!.id,
      releases: { i: Array(6).fill(false), j: [false, false, false, false, true, false] } });
    expect(model.jointLoads.map((l) => [l.joint, l.pattern, l.values])).toEqual([
      [middle!.id, model.loadPatterns[0]!.id, [1, 2, 3, 4, 12, 6]],
      [middle!.id, model.loadPatterns[0]!.id, [0, 0, -5, 0, 0, 0]],
    ]);
    expect(model.frameLoads.map((l) => [l.frame, l.kind, l.value])).toEqual([
      [left!.id, "distributed", -2], [right!.id, "distributed", -2],
    ]);
    expect(report.diagnostics.find((d) => d.code === "point_load_moment_split")).toMatchObject({ level: "info", count: 1 });
    expect(report.diagnostics.filter((d) => d.level === "error")).toEqual([]);
  });

  it("giữ cách gán mô men vào nút có sẵn trong dung sai MERGETOL", () => {
    const source = input.replace('POINT "M" 3 0', 'POINT "M" 6 0.0005').replace('AUTOMESH "YES"', 'AUTOMESH "NO"');
    const { model, report } = importE2k(source);
    expect(model.frames).toHaveLength(1);
    expect(model.joints).toHaveLength(2);
    expect(model.jointLoads).toMatchObject([{ joint: model.frames[0]!.j, values: [0, 0, 0, 0, 12, 0] }]);
    expect(report.diagnostics.find((d) => d.code === "point_load_at_joint")).toMatchObject({ level: "info" });
  });

  it.each([
    ["tắt chia lưới", input.replace('AUTOMESH "YES"', 'AUTOMESH "NO"'), 1],
    ["lệch trục thanh nhưng vẫn trong MERGETOL", input.replace('POINT "M" 3 0', 'POINT "M" 3 0.0005'), 1],
    ["giao điểm của hai thanh", input
      .replace('$ LINE CONNECTIVITIES', '  POINT "C" 3 -2\n  POINT "D" 3 2\n$ LINE CONNECTIVITIES')
      .replace('$ POINT ASSIGNS', '  LINE "B2" BEAM "C" "D" 0\n$ POINT ASSIGNS')
      .replace('$ LOAD PATTERNS', '  LINEASSIGN "B2" "S1" SECTION "C400" AUTOMESH "YES"\n$ LOAD PATTERNS'), 2],
  ] as const)("báo lỗi và giữ nguyên hình học khi %s", (_, source, numFrames) => {
    const { model, report } = importE2k(source);
    expect(model.frames).toHaveLength(numFrames);
    expect(model.joints).toHaveLength(numFrames * 2);
    expect(model.jointLoads).toEqual([]);
    expect(report.diagnostics.find((d) => d.code === "point_load_moment_location")).toMatchObject({ level: "error", objects: ["M@S1"] });
  });
});

describe("nhận diện định dạng CSI", () => {
  it("e2k, s2k (bảng TABLE:) và định dạng lạ", async () => {
    const { detectCsiFormat, importCsi, s2kProgram } = await import("../src/index.ts");
    expect(detectCsiFormat(SMALL)).toBe("e2k");
    // Dạng bảng của SAP2000 .s2k (dữ liệu tự tạo, chỉ để kiểm tra nhận diện).
    const s2k = 'File C:\\x\\24061_OMF.s2k was saved on m/d/yy at h:mm:ss\n\nTABLE:  "PROGRAM CONTROL"\n   ProgramName=SAP2000   Version=23.1.0   ProgLevel=Ultimate   CurrUnits="KN, m, C"\n\nTABLE:  "JOINT COORDINATES"\n   Joint=1   CoordSys=GLOBAL\n';
    expect(detectCsiFormat(s2k)).toBe("s2k");
    expect(s2kProgram(s2k)).toEqual({ program: "SAP2000", version: "23.1.0" });
    const r = importCsi(s2k);
    expect(r.format).toBe("s2k");
    expect(r.model.joints).toEqual([]);
    expect(r.report.program).toBe("SAP2000");
    // Nút thiếu toạ độ: báo lỗi, không nhập (bộ nhập SAP2000 thật được kiểm tra trên file thật trong s2k-fixture.test.ts).
    expect(r.report.units).toEqual({ force: "KN", length: "M", temperature: "C" });
    expect(r.report.diagnostics.filter((d) => d.level === "error").map((d) => d.code)).toEqual(["point_invalid", "no_supports_imported"]);
    expect(importCsi("hello").report.diagnostics.map((d) => d.code)).toEqual(["format_unknown"]);
    expect(importCsi(SMALL).format).toBe("e2k");
  });
});
