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

  it("giải mã Windows-1252 khi file không phải UTF-8", () => {
    expect(decodeE2k(new Uint8Array([0x24, 0x20, 0xb0]))).toBe("$ °");
  });
});
