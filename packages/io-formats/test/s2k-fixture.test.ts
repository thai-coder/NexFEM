import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkModel, sectionProperties } from "@nexfem/model-core";
import { describe, expect, it } from "vitest";
import { decodeE2k, detectCsiBinary, importCsi, importCsiFile, importS2k, parseS2k, s2kNumber, s2kTable } from "../src/index.ts";

/** File SAP2000 thật, chủ dự án cho phép công khai (tests/fixtures/csi/sap2000/README.md). */
const dir = (name: string) => fileURLToPath(new URL(`../../../tests/fixtures/csi/sap2000/${name}`, import.meta.url));
const omfBytes = readFileSync(dir("24061_OMF.s2k"));
const roofBytes = readFileSync(dir("Roof_model.2k"));
const sdbBytes = readFileSync(dir("Roof_model.sdb"));
const omfText = decodeE2k(omfBytes);
const roofText = decodeE2k(roofBytes);
const FT = 0.3048;
const LB = 4.4482216152605e-3;
const KIP = 4.4482216152605;
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const codes = (r: ReturnType<typeof importS2k>, level: string) => r.report.diagnostics.filter((d) => d.level === level).map((d) => d.code);
const diag = (r: ReturnType<typeof importS2k>, code: string) => r.report.diagnostics.find((d) => d.code === code);

describe("file SAP2000 thật: cú pháp", () => {
  it("file giữ nguyên từng byte (CRLF, SHA-256 như README)", () => {
    expect(sha(omfBytes)).toBe("a82f456fce94fdb373271c37ab2a0f2125c614269ec47c626f4f5f66ce2bce98");
    expect(sha(roofBytes)).toBe("bb0ad5cc88e46f99deab8b1ed83e530c22dc2d9c31debbfee4369d9226d62a28");
    expect(sha(sdbBytes)).toBe("dcd43f13133659fb1ee517e0e06eea6266850173202f6a079ce0ac176741b536");
    expect(omfText.split("\r\n").length).toBe(2247);
    expect(omfText).toContain("Ω"); // tên tổ hợp có ký tự không ASCII, giải mã UTF-8
  });

  it("tách bảng, bản ghi nối dòng bằng ' _' và tiêu đề thiếu dấu ngoặc kép đóng", () => {
    const f = parseS2k(roofText);
    const area = s2kTable(f, "AREA SECTION PROPERTIES")[0]!;
    expect(area.fields.get("Section")).toBe("Roof shell");
    expect(area.fields.get("M12Mod")).toBe("1"); // nằm ở dòng nối
    expect(area.fields.get("Notes")).toBe("Added 3/13/2025 5:09:23 PM");
    const omf = parseS2k(omfText);
    expect(omf.tables.has("PREFERENCES - STEEL DESIGN")).toBe(true);
    expect(s2kTable(omf, "PREFERENCES - STEEL DESIGN").length).toBe(1);
    expect(s2kTable(omf, "FRAME SECTION PROPERTIES 01 - GENERAL").length).toBe(273);
    expect(s2kTable(omf, "COMBINATION DEFINITIONS").length).toBeGreaterThan(87);
  });
});

describe("24061_OMF.s2k (SAP2000 23.1.0, khung phẳng YZ, lb-ft)", () => {
  const r = importS2k(omfText);
  const { model, report } = r;
  const j = (label: string) => model.joints.find((x) => x.label === label)!;
  const fr = (label: string) => model.frames.find((x) => x.label === label)!;

  it("chương trình, đơn vị, tên mô hình (dòng đầu) và số lượng", () => {
    expect(model.name).toBe("24061_OMF");
    expect([report.program, report.version]).toEqual(["SAP2000", "23.1.0"]);
    expect(report.units).toEqual({ force: "LB", length: "FT", temperature: "F" });
    expect(report.counts).toMatchObject({
      joints: { source: 4, imported: 4 },
      frames: { source: 3, imported: 3 },
      materials: { source: 3, imported: 3 },
      frameSections: { source: 273, imported: 273 },
      loadPatterns: { source: 53, imported: 53 },
      loadCases: { source: 12, imported: 12 },
      combos: { source: 87, imported: 87 },
      frameLoads: { source: 14, imported: 14 },
      pointLoads: { source: 2, imported: 2 },
    });
  });

  it("toạ độ đổi ft → m; trục Z thành tầng", () => {
    expect(j("1")).toMatchObject({ x: 0, y: 0, z: 4.1148 });
    expect(j("3").y).toBeCloseTo(35 * FT, 10);
    expect(model.stories.map((s) => [s.name, s.elevation])).toEqual([["Z1", 0], ["Z2", 4.1148]]);
    expect(j("1").story).toBe(model.stories[1]!.id);
  });

  it("bậc tự do không hoạt động (UX, RY, RZ) thành gối ở mọi nút, cộng với gối khai báo", () => {
    expect(diag(r, "active_dof_restrained")?.params).toEqual({ dofs: "UX RY RZ" });
    expect(j("1").restraint).toEqual([true, false, false, false, true, true]);
    expect(j("2").restraint).toEqual([true, true, true, false, true, true]);
  });

  it("thanh: tiết diện, loại, liên kết nửa cứng rất cứng coi như không nhả", () => {
    const sec = (f: { section: string }) => model.frameSections.find((s) => s.id === f.section)!.name;
    expect([fr("1").kind, sec(fr("1"))]).toEqual(["column", "W14X211"]);
    expect([fr("3").kind, sec(fr("3"))]).toEqual(["beam", "W12X336"]);
    expect(fr("3").releases).toBeUndefined();
    expect(diag(r, "partial_fixity_as_fixed")?.objects).toEqual(["3 (M3I)", "3 (M3J)"]);
    // Hai cột xoay 90°: trục 2 nằm trong mặt phẳng khung YZ, cột uốn trong mặt phẳng quanh trục khoẻ.
    expect([fr("1").angle, fr("2").angle, fr("3").angle]).toEqual([90, 90, undefined]);
    expect(diag(r, "frame_angle_imported")?.objects).toEqual(["1", "2"]);
    expect(diag(r, "frame_angle_ignored")).toBeUndefined();
    expect(diag(r, "frame_cardinal_ignored")?.params).toEqual({ point: "8" });
  });

  it("tải trên thanh: phân bố lb/ft → kN/m, tập trung lb → kN tại RelDist", () => {
    const sdl = model.loadPatterns.find((p) => p.name === "SDL")!;
    const dist = model.frameLoads.filter((l) => l.pattern === sdl.id && l.kind === "distributed").map((l) => l.value);
    expect(dist[0]).toBeCloseTo((125 * LB) / FT, 10);
    expect(dist[1]).toBeCloseTo((161.5 * LB) / FT, 10);
    const pts = model.frameLoads.filter((l) => l.pattern === sdl.id && l.kind === "point");
    expect(pts.map((l) => l.at)).toEqual([0.5, 0.5, 0, 1]);
    expect(pts[0]!.value).toBeCloseTo(3936 * LB, 10);
    expect(pts.every((l) => l.direction === "gravity")).toBe(true);
  });

  it("tải nút (gió WY, động đất EY) tại nút 1, hệ GLOBAL, lb → kN", () => {
    const pat = (id: string) => model.loadPatterns.find((p) => p.id === id)!.name;
    expect(model.jointLoads.map((l) => [model.joints.find((j) => j.id === l.joint)!.label, pat(l.pattern)])).toEqual([["1", "WY"], ["1", "EY"]]);
    expect(model.jointLoads[0]!.values[1]).toBeCloseTo(17500 * LB, 9);
    expect(model.jointLoads[1]!.values[1]).toBeCloseTo(25600 * LB, 9);
    expect(model.jointLoads[0]!.values.filter((_, i) => i !== 1)).toEqual([0, 0, 0, 0, 0]);
    expect(codes(r, "error")).toEqual([]);
  });

  it("tổ hợp lồng nhau (ENV) trỏ tới tổ hợp khác; mọi thành phần trỏ tới trường hợp hoặc tổ hợp có thật", () => {
    const ids = new Set([...model.loadCases.map((c) => c.id), ...model.combos.map((c) => c.id)]);
    expect(model.combos.every((c) => c.items.every((i) => ids.has(i.case)))).toBe(true);
    const env = model.combos.find((c) => c.name === "ENV LRFD")!;
    expect(env.type).toBe("envelope");
    expect(env.items.length).toBe(43);
    expect(env.items.every((i) => model.combos.some((c) => c.id === i.case))).toBe(true);
  });

  it("đặc trưng tiết diện NexFEM tự tính khớp bảng AISC trong file (273 tiết diện W)", () => {
    const f = parseS2k(omfText);
    for (const row of s2kTable(f, "FRAME SECTION PROPERTIES 01 - GENERAL")) {
      const sec = model.frameSections.find((s) => s.name === row.fields.get("SectionName"))!;
      const p = sectionProperties(sec.geometry);
      const v = (k: string, pow: number) => s2kNumber(row.fields.get(k)) * FT ** pow;
      expect(Math.abs(p.A / v("Area", 2) - 1)).toBeLessThan(0.01);
      expect(Math.abs(p.I33 / v("I33", 4) - 1)).toBeLessThan(0.015);
      expect(Math.abs(p.I22 / v("I22", 4) - 1)).toBeLessThan(0.015);
      expect(Math.abs(p.J / v("TorsConst", 4) - 1)).toBeLessThan(0.02);
      expect(sec.shearAreas?.a2).toBeCloseTo(v("AS2", 2), 12);
    }
    // Hai tiết diện có thanh dùng đều trong ngưỡng: không có cảnh báo.
    expect(diag(r, "section_props_differ")).toBeUndefined();
  });

  it("mô hình hợp lệ và nhập hai lần cho cùng kết quả", () => {
    expect(checkModel(model).filter((i) => i.level === "error")).toEqual([]);
    expect(JSON.stringify(importS2k(omfText))).toBe(JSON.stringify(r));
  });
});

describe("Roof_model.2k (SAP2000 25.3.1, kip-ft, mặt None)", () => {
  const r = importS2k(roofText);
  const { model, report } = r;
  const j = (label: string) => model.joints.find((x) => x.label === label)!;

  it("chương trình, đơn vị và số lượng", () => {
    expect(model.name).toBe("Roof model");
    expect([report.program, report.version]).toEqual(["SAP2000", "25.3.1"]);
    expect(report.units).toEqual({ force: "KIP", length: "FT", temperature: "F" });
    expect(report.counts).toMatchObject({
      joints: { source: 16, imported: 16 },
      frames: { source: 13, imported: 13 },
      shells: { source: 4, imported: 4 },
      frameSections: { source: 132, imported: 132 },
      loadPatterns: { source: 5, imported: 5 },
      loadCases: { source: 6, imported: 6 },
      combos: { source: 18, imported: 18 },
      shellLoads: { source: 16, imported: 16 },
    });
    expect(codes(r, "error")).toEqual([]);
  });

  it("gối: đủ 6 bậc tự do hoạt động, gối con lăn ở nút 9", () => {
    expect(diag(r, "active_dof_restrained")).toBeUndefined();
    expect(model.joints.filter((x) => x.restraint).length).toBe(7);
    expect(j("9").restraint).toEqual([false, false, true, false, false, false]);
  });

  it("mặt có tiết diện None thành sàn không trọng lượng; tải mặt ksf → kN/m², trục 3 cục bộ", () => {
    const none = model.shellSections.find((s) => s.name === "None")!;
    expect(model.shells.every((s) => s.section === none.id)).toBe(true);
    expect(model.materials.find((m) => m.id === none.material)!.gamma).toBe(0);
    expect(diag(r, "area_section_none")?.count).toBe(4);
    const lr = model.loadPatterns.find((p) => p.name === "Lr")!;
    const wd = model.loadPatterns.find((p) => p.name === "Wd")!;
    const l1 = model.shellLoads.find((l) => l.pattern === lr.id)!;
    expect(l1.direction).toBe("gravity");
    expect(l1.value).toBeCloseTo((0.02 * KIP) / FT ** 2, 10);
    expect(model.shellLoads.filter((l) => l.pattern === wd.id).every((l) => l.direction === "local3" && l.value < 0)).toBe(true);
    expect(model.shells.find((s) => s.label === "2")!.joints.length).toBe(3);
  });

  it("FilletRadius = 0 trong file: suy bán kính lượn từ diện tích bảng thép, đặc trưng khớp lại", () => {
    // W8X24 (có thanh dùng): k_des − t_f của AISC = 0,794 − 0,400 in = 10,0 mm.
    const w8 = model.frameSections.find((s) => s.name === "W8X24")!;
    expect(w8.geometry.shape === "I" && w8.geometry.r).toBeCloseTo(0.01, 4);
    expect(diag(r, "section_fillet_inferred")?.objects).toEqual(["W8X24 (r ≈ 10.0 mm)"]);
    expect(diag(r, "section_fillet_inferred_unused")?.params).toEqual({ count: 30 });
    const f = parseS2k(roofText);
    for (const row of s2kTable(f, "FRAME SECTION PROPERTIES 01 - GENERAL")) {
      const p = sectionProperties(model.frameSections.find((s) => s.name === row.fields.get("SectionName"))!.geometry);
      const v = (k: string, pow: number) => s2kNumber(row.fields.get(k)) * FT ** pow;
      expect(Math.abs(p.A / v("Area", 2) - 1)).toBeLessThan(0.01);
      expect(Math.abs(p.I33 / v("I33", 4) - 1)).toBeLessThan(0.015);
      expect(Math.abs(p.J / v("TorsConst", 4) - 1)).toBeLessThan(0.025);
    }
  });

  it("mô hình hợp lệ", () => {
    expect(checkModel(model).filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("tải nút (dữ liệu tự tạo, chỉ để kiểm tra quy tắc)", () => {
  const S2K = [
    "File C:\\x\\t.$2k was saved on m/d/yy at h:mm:ss",
    'TABLE:  "PROGRAM CONTROL"',
    '   ProgramName=SAP2000   Version=25.3.1   CurrUnits="KN, m, C"',
    'TABLE:  "JOINT COORDINATES"',
    "   Joint=1   CoordSys=GLOBAL   CoordType=Cartesian   XorR=0   Y=0   Z=0",
    "   Joint=2   CoordSys=GLOBAL   CoordType=Cartesian   XorR=4   Y=0   Z=0",
    "   Joint=3   CoordSys=GLOBAL   CoordType=Cartesian   XorR=1   Y=0   Z=0",
    'TABLE:  "JOINT RESTRAINT ASSIGNMENTS"',
    "   Joint=1   U1=Yes   U2=Yes   U3=Yes   R1=Yes   R2=Yes   R3=Yes",
    'TABLE:  "MATERIAL PROPERTIES 01 - GENERAL"',
    "   Material=S   Type=Steel",
    'TABLE:  "MATERIAL PROPERTIES 02 - BASIC MECHANICAL PROPERTIES"',
    "   Material=S   UnitWeight=0   E1=200000000   U12=0.3",
    'TABLE:  "FRAME SECTION PROPERTIES 01 - GENERAL"',
    "   SectionName=R   Material=S   Shape=Rectangular   t3=0.4   t2=0.2",
    'TABLE:  "CONNECTIVITY - FRAME"',
    "   Frame=1   JointI=1   JointJ=2",
    'TABLE:  "FRAME SECTION ASSIGNMENTS"',
    "   Frame=1   AnalSect=R   MatProp=Default",
    'TABLE:  "LOAD PATTERN DEFINITIONS"',
    "   LoadPat=P   DesignType=Live   SelfWtMult=0",
    'TABLE:  "JOINT LOADS - FORCE"',
    "   Joint=2   LoadPat=P   CoordSys=GLOBAL   F1=0   F2=0   F3=-5   M1=0   M2=0   M3=2",
    "   Joint=3   LoadPat=P   CoordSys=GLOBAL   F1=0   F2=0   F3=-10   M1=0   M2=0   M3=0",
    "   Joint=3   LoadPat=P   CoordSys=GLOBAL   F1=0   F2=0   F3=0   M1=1   M2=0   M3=0",
    "   Joint=2   LoadPat=P   CoordSys=Local   F1=1",
    "END TABLE DATA",
  ].join("\r\n");
  const r = importS2k(S2K);

  it("nút đầu thanh: tải nút đủ 6 thành phần; nút nằm giữa thanh: tải tập trung trên thanh tại đúng vị trí", () => {
    expect(r.model.jointLoads.map((l) => l.values)).toEqual([[0, 0, -5, 0, 0, 2]]);
    expect(r.model.frameLoads).toEqual([{ id: "fl-1", frame: r.model.frames[0]!.id, pattern: r.model.loadPatterns[0]!.id, kind: "point", direction: "globalZ", value: -10, at: 0.25 }]);
    expect(diag(r, "point_load_on_frame")?.objects).toEqual(["3 → 1 @ 0.250"]);
    expect(r.report.counts.pointLoads).toEqual({ source: 4, imported: 2 });
  });

  it("mô men ở nút giữa thanh và hệ toạ độ khác GLOBAL: báo lỗi", () => {
    expect(codes(r, "error")).toEqual(["point_load_moment_on_frame", "point_load_coord_unsupported"]);
  });
});

describe("nhận diện định dạng", () => {
  it("file .sdb nhị phân: báo rõ, không cố đọc", () => {
    expect(detectCsiBinary(sdbBytes)).toEqual({ format: "sdb", version: "25.3.1" });
    const r = importCsiFile(sdbBytes, "s2k");
    expect(r.format).toBe("sdb");
    expect(r.report.diagnostics.map((d) => [d.code, d.params])).toEqual([["format_sdb_binary", { version: "25.3.1" }]]);
    expect(r.model.joints).toEqual([]);
  });

  it("file .s2k nhập qua importCsiFile như importS2k", () => {
    const r = importCsiFile(roofBytes, "s2k");
    expect(r.format).toBe("s2k");
    expect(r.report.counts.frames).toEqual({ source: 13, imported: 13 });
  });

  it("chọn mục ETABS nhưng file là SAP2000: vẫn nhập theo nội dung, có cảnh báo", () => {
    const r = importCsi(roofText, "e2k");
    expect(r.format).toBe("s2k");
    expect(r.report.diagnostics[0]).toMatchObject({ level: "warning", code: "format_mismatch", params: { expected: "ETABS", actual: "SAP2000" } });
  });

  it("file văn bản lạ", () => {
    expect(importCsi("hello").report.diagnostics.map((d) => d.code)).toEqual(["format_unknown"]);
  });
});
