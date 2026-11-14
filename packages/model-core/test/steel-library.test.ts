import { describe, expect, it } from "vitest";
import { checkSteelLibrary, parseSteelLibraryCsv } from "../src/index.ts";

const CSV = `standard,family,name,shape,h,b,tw,tf,r,d,t,A,Iy,Iz,It
EN 10365:2017,IPE,IPE 300,I,300,150,7.1,10.7,15,,,53.81,8356,603.8,20.12
EN 10365:2017,HEB,HEB 300,I,300,300,11,19,27,,,149.1,25170,8563,185.0
# dòng chú thích được bỏ qua
Tự nhập,Hàn,I400x200,I,400,200,8,13,,,,,,,
Tự nhập,Hộp,B200x10,box,200,200,,,,,10,,,,
Tự nhập,Ống,P219x8,pipe,,,,,,219.1,8,,,,
`;

describe("đọc thư viện thép CSV (định dạng NexFEM)", () => {
  it("đọc đúng kích thước (mm → m), giá trị bảng (cm → m) và bỏ qua dòng chú thích", () => {
    const r = parseSteelLibraryCsv(CSV);
    expect(r.format).toBe("nexfem");
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.name)).toEqual(["IPE 300", "HEB 300", "I400x200", "B200x10", "P219x8"]);
    const ipe = r.rows[0]!;
    expect(ipe.geometry).toEqual({ shape: "I", h: 0.3, bf: 0.15, tw: 0.0071, tf: 0.0107, r: 0.015 });
    expect(ipe.ref.A).toBeCloseTo(53.81e-4, 10);
    expect(ipe.ref.I33).toBeCloseTo(8356e-8, 12);
    expect(r.rows[2]!.geometry).toEqual({ shape: "I", h: 0.4, bf: 0.2, tw: 0.008, tf: 0.013 });
    expect(r.rows[2]!.ref).toEqual({});
    expect(r.rows[3]!.geometry).toEqual({ shape: "box", h: 0.2, b: 0.2, t: 0.01 });
    expect(r.rows[4]!.geometry.shape).toBe("pipe");
  });

  it("chấm phẩy kèm dấu thập phân phẩy (Excel tiếng Việt)", () => {
    const r = parseSteelLibraryCsv("standard;family;name;shape;h;b;tw;tf;r;A\nEN;IPE;IPE 300;I;300;150;7,1;10,7;15;53,81\n");
    expect(r.errors).toEqual([]);
    expect(r.rows[0]!.geometry).toMatchObject({ tw: 0.0071, tf: 0.0107 });
    expect(r.rows[0]!.ref.A).toBeCloseTo(53.81e-4, 10);
  });

  it("báo lỗi theo dòng khi thiếu kích thước hoặc hình chưa hỗ trợ", () => {
    const r = parseSteelLibraryCsv("standard,family,name,shape,h,b,tw,tf\nX,I,I1,I,300,,7,10\nX,L,L50,L,50,50,5,5\n");
    expect(r.rows).toEqual([]);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3]);
    expect(r.errors[0]!.message).toContain("b");
  });
});

describe("đối chiếu thư viện với giá trị bảng", () => {
  it("tiết diện thép cán đúng thì không bị gắn cờ; số liệu sai bị gắn cờ", () => {
    const bad = CSV.replace("53.81,8356", "60.00,8356");
    const checks = checkSteelLibrary(parseSteelLibraryCsv(bad).rows);
    expect(checks[0]!.flagged).toEqual(["A"]);
    expect(checks[1]!.flagged).toEqual([]);
    expect(Math.abs(checks[1]!.dev.I33!)).toBeLessThan(0.001);
    // Dòng không có giá trị bảng: không có gì để so.
    expect(checks[2]!.dev).toEqual({});
  });
});

describe("bảng AISC Shapes Database lưu thành CSV", () => {
  it("nhận ra định dạng, đổi inch sang m, r = kdes − tf; bỏ qua loại chưa hỗ trợ", () => {
    const aisc = [
      "Type,EDI_Std_Nomenclature,AISC_Manual_Label,W,A,d,bf,tw,tf,kdes,Ix,Iy,J,Ht,B,tdes,OD",
      "W,W14X22,W14X22,22,6.49,13.7,5,0.23,0.335,0.735,199,7,0.208,,,,",
      "HSS,HSS6X4X1/4,HSS6X4X1/4,15.6,4.30,,,,,,20.9,11.1,23.6,6,4,0.233,",
      "PIPE,Pipe4STD,Pipe4STD,10.8,2.96,,,,,,6.82,6.82,13.6,,,0.221,4.5",
      "L,L4X4X1/2,L4X4X1/2,12.8,3.75,,,,,,5.52,5.52,0.322,,,,",
    ].join("\n");
    const r = parseSteelLibraryCsv(aisc);
    expect(r.format).toBe("aisc");
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.name)).toEqual(["W14X22", "HSS6X4X1/4", "Pipe4STD"]);
    const w = r.rows[0]!.geometry;
    expect(w.shape).toBe("I");
    if (w.shape === "I") {
      expect(w.h).toBeCloseTo(13.7 * 0.0254, 10);
      expect(w.r).toBeCloseTo((0.735 - 0.335) * 0.0254, 10);
    }
    expect(r.rows[0]!.ref.A).toBeCloseTo(6.49 * 0.0254 ** 2, 12);
    expect(r.rows[1]!.geometry).toMatchObject({ shape: "box" });
    expect(r.rows[2]!.geometry).toMatchObject({ shape: "pipe" });
  });
});
