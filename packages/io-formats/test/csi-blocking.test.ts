import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeE2k, importE2k, importS2k, s2kFields } from "../src/index.ts";

/**
 * Chính sách chặn mở mô hình CSI (report.blocked): tải không đều, khoá lạ, bảng chưa kiểm chứng, trường rỗng.
 * Đầu vào là biến thể của file TỔNG HỢP (tests/benchmarks/csi/cases, tests/fixtures/csi/synthetic), không phải file CSI xuất thật.
 */
const read = (rel: string) => decodeE2k(readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url))));
const SS = read("tests/benchmarks/csi/cases/simply-supported-udl.s2k");
const MOMENT = read("tests/fixtures/csi/synthetic/etabs-interior-moment.e2k");
const addTable = (text: string, name: string, rows: string[]) =>
  text.replace("END TABLE DATA", `TABLE:  "${name}"\r\n${rows.map((r) => "   " + r).join("\r\n")}\r\n\r\nEND TABLE DATA`);
const errors = (r: { report: { diagnostics: { level: string; code: string }[] } }) => r.report.diagnostics.filter((d) => d.level === "error").map((d) => d.code);

describe("s2kFields: khoảng trắng quanh dấu bằng", () => {
  it("đọc `Tên = Giá trị`", () => {
    expect(s2kFields("LoadPat = W1   DesignType=Wind").get("LoadPat")).toBe("W1");
  });
  it("trường rỗng không nuốt trường kế tiếp", () => {
    const f = s2kFields('LoadPat=EQX   Notes= AutoLoad="ASCE 7-16"   Color=Red');
    expect(f.get("AutoLoad")).toBe("ASCE 7-16");
    expect(f.get("Color")).toBe("Red");
    expect(f.has("Notes")).toBe(false);
    expect(s2kFields("Notes= Color=Red").get("Color")).toBe("Red");
  });
  it("AutoLoad sau trường rỗng vẫn bị phát hiện và chặn", () => {
    const text = SS.replace("LoadPat=W   DesignType=Other   SelfWtMult=0", 'LoadPat=W   DesignType=Other   SelfWtMult=0   Notes= AutoLoad="ASCE 7-16"');
    expect(errors(importS2k(text))).toContain("automatic_load_unsupported");
  });
});

describe("SAP2000: tải thanh", () => {
  it("mô hình gốc sạch thì mở được", () => {
    const r = importS2k(SS);
    expect(r.report.blocked).toBe(false);
    expect(r.model.frameLoads).toHaveLength(1);
  });
  it("tải hình thang: không đổi thành tải đều, chặn", () => {
    const r = importS2k(SS.replace("FOverLB=5", "FOverLB=8"));
    expect(errors(r)).toEqual(["line_load_not_uniform"]);
    expect(r.model.frameLoads).toHaveLength(0);
    expect(r.report.blocked).toBe(true);
  });
  it("tải trên một đoạn: chặn", () => {
    expect(errors(importS2k(SS.replace("RelDistA=0", "RelDistA=0.25")))).toEqual(["line_load_not_uniform"]);
  });
  it("DistType=AbsDist: nhận khi AbsDist khớp RelDist theo chiều dài, chặn khi lệch", () => {
    const ok = importS2k(SS.replace("DistType=RelDist", "DistType=AbsDist").replace("AbsDistB=6", "AbsDistB=6"));
    expect(ok.report.blocked).toBe(false);
    const bad = importS2k(SS.replace("DistType=RelDist", "DistType=AbsDist").replace("AbsDistB=6", "AbsDistB=3"));
    expect(errors(bad)).toEqual(["line_load_unsupported"]);
  });
  it("hệ số trọng lượng bản thân âm: chặn", () => {
    expect(errors(importS2k(SS.replace("SelfWtMult=0", "SelfWtMult=-1")))).toEqual(["pattern_selfweight_invalid"]);
  });
});

describe("SAP2000: phân loại bảng chưa đọc", () => {
  it("bảng thiết kế, cốt thép, hàm, nhóm: thông tin, không chặn", () => {
    let text = addTable(SS, "PREFERENCES - STEEL DESIGN - AISC 360-16", ["THDesign=Envelopes   FrameType=SMF"]);
    text = addTable(text, "REBAR SIZES", ["RebarID=#4   Area=0.2   Diameter=0.5"]);
    text = addTable(text, "FUNCTION - RESPONSE SPECTRUM - USER", ["Name=RS   Period=0   Accel=1"]);
    text = addTable(text, "OVERWRITES - STEEL DESIGN - AISC 360-16", ["Frame=1   DesignSect=R200X400"]);
    const r = importS2k(text);
    expect(r.report.blocked).toBe(false);
    expect(r.report.diagnostics.filter((d) => d.code === "section_ignored")).toHaveLength(4);
  });
  it("ANALYSIS OPTIONS: mặc định là thông tin; độ cứng từ trường hợp khác thì chặn", () => {
    expect(importS2k(addTable(SS, "ANALYSIS OPTIONS", ["Solver=Advanced   StiffCase=None   GeomMod=None"])).report.blocked).toBe(false);
    expect(importS2k(addTable(SS, "ANALYSIS OPTIONS", ["Solver=Advanced   StiffCase=PDELTA   GeomMod=None"])).report.blocked).toBe(true);
  });
  it("FRAME LOAD TRANSFER OPTIONS: Transfer=No thì chặn", () => {
    expect(importS2k(addTable(SS, "FRAME LOAD TRANSFER OPTIONS", ["Frame=1   Transfer=Yes"])).report.blocked).toBe(false);
    expect(importS2k(addTable(SS, "FRAME LOAD TRANSFER OPTIONS", ["Frame=1   Transfer=No"])).report.blocked).toBe(true);
  });
  it("AUTO COMBINATION: AutoGen=Yes thì chặn (tổ hợp sinh tự động có thể không có trong file)", () => {
    expect(importS2k(addTable(SS, "AUTO COMBINATION OPTION DATA 01 - GENERAL", ["DesignType=Steel   AutoGen=No"])).report.blocked).toBe(false);
    expect(importS2k(addTable(SS, "AUTO COMBINATION OPTION DATA 01 - GENERAL", ["DesignType=Steel   AutoGen=Yes"])).report.blocked).toBe(true);
  });
  it("bảng lạ và bảng tải chưa đọc: lỗi; bảng tải được gọi đúng là thiếu tải", () => {
    expect(errors(importS2k(addTable(SS, "SOMETHING NEW", ["A=1"])))).toEqual(["section_unverified"]);
    expect(errors(importS2k(addTable(SS, "FRAME LOADS - TEMPERATURE", ["Frame=1   LoadPat=W   Temp=5"])))).toEqual(["load_table_unsupported"]);
  });
});

describe("ETABS: tải và phép gán chưa hỗ trợ", () => {
  it("mô hình gốc tổng hợp mở được", () => {
    expect(importE2k(MOMENT).report.blocked).toBe(false);
  });
  const withLoads = (lines: string[]) =>
    MOMENT.replace("$ POINT OBJECT LOADS", ["$ FRAME OBJECT LOADS", ...lines, "$ POINT OBJECT LOADS"].join("\n"));
  it("LINELOAD đều suốt chiều dài: nhập", () => {
    const r = importE2k(withLoads(['  LINELOAD "B1" "S1" TYPE "UNIFF" DIR "GRAV" LC "MOMENT" FVAL 2']));
    expect(r.report.blocked).toBe(false);
  });
  it("LINELOAD TRAPF không đều hoặc một đoạn: chặn", () => {
    expect(errors(importE2k(withLoads(['  LINELOAD "B1" "S1" TYPE "TRAPF" DIR "GRAV" LC "MOMENT" FSTART 2 FEND 4 RDSTART 0 RDEND 1'])))).toEqual(["line_load_not_uniform"]);
    expect(errors(importE2k(withLoads(['  LINELOAD "B1" "S1" TYPE "TRAPF" DIR "GRAV" LC "MOMENT" FSTART 2 FEND 2 RDSTART 0.5 RDEND 1'])))).toEqual(["line_load_not_uniform"]);
  });
  it("khoá lạ trên LINELOAD/POINTLOAD (ví dụ CSYS): chặn, không đoán hệ toạ độ", () => {
    expect(errors(importE2k(withLoads(['  LINELOAD "B1" "S1" TYPE "UNIFF" DIR "X" LC "MOMENT" FVAL 2 CSYS "Local"'])))).toEqual(["load_key_unsupported"]);
    const r = importE2k(MOMENT.replace('MY 12', 'MY 12 CSYS "Local"'));
    expect(errors(r)).toEqual(["load_key_unsupported"]);
  });
  it("POINTASSIGN khác gối (ví dụ PANELZONE): chặn", () => {
    const r = importE2k(MOMENT.replace('RESTRAINT "UX UY UZ RX RY RZ"', 'RESTRAINT "UX UY UZ RX RY RZ" PANELZONE "PZ1"'));
    expect(errors(r)).toEqual(["point_assign_unsupported"]);
  });
  it("tuỳ chọn và ghi đè thiết kế: thông tin, không chặn", () => {
    const r = importE2k(MOMENT.replace("$ END OF MODEL FILE", '$ STEEL DESIGN PREFERENCES\n  STEELPREFERENCE CODE "AISC 360-16"\n$ CONCRETE SLAB DESIGN OVERWRITES - STRIP BASED\n  X 1\n$ END OF MODEL FILE'));
    expect(r.report.blocked).toBe(false);
  });
});
