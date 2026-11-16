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
  /** Nhãn thanh gốc của một đoạn ("B8-2" → "B8"); nhãn trong file mẫu không có dạng "-số". */
  const host = (label: string) => label.replace(/-\d+$/, "");
  const codesAt = (level: string) => [...new Set(report.diagnostics.filter((x) => x.level === level).map((x) => x.code))];
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

  it("tiết diện: chữ I, ống hộp, bê tông chữ nhật, chữ L, General", () => {
    const sec = (name: string) => model.frameSections.find((s) => s.name === name)!;
    expect(sec("W8X18").geometry).toEqual({ shape: "I", h: 8.14 * IN, bf: 5.25 * IN, tf: 0.33 * IN, tw: 0.23 * IN });
    expect(sec("HSS10X6X1/2").geometry).toEqual({ shape: "box", h: 10 * IN, b: 6 * IN, t: 0.465 * IN });
    expect(sec("GB48x60").geometry).toEqual({ shape: "rect", b: 48 * IN, h: 60 * IN });
    expect(model.frameSections.length).toBe(305);
    expect(total("section_unsupported")).toBe(0);
    // Steel Angle: D 3 B 3 TF 0.5 TW 0.5 → cánh h dọc trục 2 dày TW, cánh b dọc trục 3 dày TF.
    expect(sec("L3X3X1/2").geometry).toEqual({ shape: "L", h: 3 * IN, b: 3 * IN, tw: 0.5 * IN, tf: 0.5 * IN });
    expect(total("section_angle_geometric_axes")).toBe(8);
    // General: AREA 59.67 AS2 5.94 AS3 6.625 I33 1468.75 I22 1528.03 TORSION 1 (in², in⁴).
    const g = sec("W14x120 & W14x82");
    expect(g.geometry).toEqual({ shape: "general", A: 59.67 * IN ** 2, I33: 1468.75 * IN ** 4, I22: 1528.03 * IN ** 4, J: 1 * IN ** 4, h: 14.89 * IN, b: 14.48 * IN });
    expect(g.shearAreas).toEqual({ a2: 5.94 * IN ** 2, a3: 6.625 * IN ** 2 });
    expect(total("section_general_imported")).toBe(3);
    expect(diag("section_filled_tube")[0]!.objects).toEqual(["HSS16x16x5/8 with concrete"]);
  });

  it("cao độ nút = cao độ tầng − DZ: mọi cột đứng thẳng và đi từ dưới lên", () => {
    const joint = new Map(model.joints.map((j) => [j.id, j]));
    const cols = model.frames.filter((f) => f.kind === "column");
    // 54 cột; một số được chia tại nút nằm trên thân cột (đoạn "Cxx-1", "Cxx-2"…).
    expect(new Set(cols.map((c) => host(c.label))).size).toBe(54);
    expect(cols.length).toBe(63);
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

  it("thanh: 244 dầm + 54 cột + 24 giằng chữ L (khớp hai đầu, chỉ chịu kéo trong ETABS)", () => {
    expect(new Set(model.frames.filter((f) => f.kind === "beam").map((f) => host(f.label))).size).toBe(244);
    expect(model.frames.filter((f) => f.kind === "brace").length).toBe(24);
    expect(total("frame_section_unavailable")).toBe(0);
    expect(report.counts.frames).toEqual({ source: 322, imported: 322 });
    expect(total("frame_limit_ignored")).toBeGreaterThanOrEqual(24);
    // B8 khớp hai đầu, bị chia làm hai đoạn: nhả liên kết giữ ở hai đầu ngoài, chỗ chia liền.
    const b8 = model.frames.filter((f) => host(f.label) === "B8");
    expect(b8.map((f) => [f.label, f.releases])).toEqual([
      ["B8-1", { i: [false, false, false, false, true, true], j: [false, false, false, false, false, false] }],
      ["B8-2", { i: [false, false, false, false, false, false], j: [false, false, false, false, true, true] }],
    ]);
  });

  it("ETABS tự chia thanh tại nút nằm trên thân thanh: NexFEM chia giống vậy, các đoạn nối đúng nút", () => {
    expect(diag("frames_split")[0]!.params).toEqual({ hosts: 87, segments: 287 });
    // B180 (dầm khớp) tựa lên thân hai dầm khác: sau khi chia, hai đầu của nó nằm trên các đoạn khác (không treo).
    const ends = (lbl: string) => model.frames.filter((f) => host(f.label) === lbl).flatMap((f) => [f.i, f.j]);
    const b180 = model.frames.find((f) => f.label === "B180")!;
    for (const id of [b180.i, b180.j]) expect(model.frames.filter((f) => f.i === id || f.j === id).length).toBeGreaterThan(1);
    expect(ends("B180").length).toBe(2);
    // Tổng chiều dài các đoạn bằng chiều dài thanh gốc.
    const jm = new Map(model.joints.map((j) => [j.id, j]));
    const len = (f: (typeof model.frames)[number]) => Math.hypot(jm.get(f.j)!.x - jm.get(f.i)!.x, jm.get(f.j)!.y - jm.get(f.i)!.y, jm.get(f.j)!.z - jm.get(f.i)!.z);
    const b8 = model.frames.filter((f) => host(f.label) === "B8");
    const [a, b] = [jm.get(b8[0]!.i)!, jm.get(b8[b8.length - 1]!.j)!];
    expect(b8.reduce((t, f) => t + len(f), 0)).toBeCloseTo(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), 9);
  });

  it("sàn: 29 sàn với tiết diện đã định nghĩa", () => {
    expect(model.shells.length).toBe(29);
    expect(model.shellSections.map((s) => s.name)).toEqual(["Shell none_Slab", "30in footing", "Shell none_Wall"]);
    expect(diag("shell_section_unsupported")[0]!.objects).toEqual(["Deck1"]);
  });

  it("tải: mẫu, tải thanh (hình thang giữ hợp lực), tải sàn, tải tập trung tại nút", () => {
    expect(model.loadPatterns.map((p) => p.name)).toEqual(["CDL", "SDL", "LL", "Lr", "WX", "WY", "EX", "EY", "S", "R", "H"]);
    expect(model.loadPatterns[0]!.selfWeight).toBe(1);
    const ids = (label: string) => new Set(model.frames.filter((f) => host(f.label) === label).map((f) => f.id));
    const load = (label: string) => model.frameLoads.find((l) => ids(label).has(l.frame))!;
    expect(load("B93").value).toBeCloseTo((29.75 * LB) / IN, 9);
    expect(load("B2").value).toBeCloseTo((21.25 * (0.9916667 - 0.008333334) * LB) / IN, 9);
    // 24 tải phân bố trên thanh gốc; thanh bị chia nhận tải trên mọi đoạn.
    expect(model.frameLoads.filter((l) => l.kind === "distributed").length).toBe(60);
    expect(total("line_load_approximated")).toBe(9);
    // 0,6944444 psi = 100 psf ≈ 4,788 kN/m².
    expect(model.shellLoads[0]!.value).toBeCloseTo(4.788, 3);
    expect(model.shellLoads.length).toBe(16);
    // 31 tải tập trung: 8 đặt tại nút đầu thanh; 23 ở điểm riêng (USERJOINT) nằm trên dầm, ETABS chia dầm tại đó,
    // nên nhập thành tải tập trung trên dầm tại đúng vị trí (tương đương chính xác), có cảnh báo.
    expect(report.counts.pointLoads).toEqual({ source: 31, imported: 31 });
    expect(model.jointLoads.length).toBe(8);
    const jl = model.jointLoads[0]!;
    expect(model.joints.find((j) => j.id === jl.joint)!.label).toBe("36");
    expect(model.loadPatterns.find((p) => p.id === jl.pattern)!.name).toBe("WY");
    expect(jl.values[1]).toBeCloseTo(-10347 * LB, 9);
    expect(jl.values.filter((_, i) => i !== 1)).toEqual([0, 0, 0, 0, 0]);
    expect(total("point_load_on_frame")).toBe(23);
    const onBeam = model.frameLoads.filter((l) => l.kind === "point");
    expect(onBeam.length).toBe(23);
    expect(onBeam.every((l) => l.direction === "globalX")).toBe(true);
    // Điểm "198" (x = 6 in) nằm trên dầm B7 (từ điểm "36" tại x = 0): vị trí 6 in tính từ đầu i.
    const b7 = model.frames.find((f) => host(f.label) === "B7")!; // đoạn đầu tiên nếu B7 bị chia
    const [i7, j7] = [b7.i, b7.j].map((id) => model.joints.find((j) => j.id === id)!);
    const first = onBeam.find((l) => l.frame === b7.id)!;
    expect(first.at! * Math.hypot(j7!.x - i7!.x, j7!.y - i7!.y, j7!.z - i7!.z)).toBeCloseTo(6 * IN, 9);
    expect(first.value).toBeCloseTo(4992 * LB, 9);
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

  it("báo rõ các thứ chưa hỗ trợ: điểm chèn; góc xoay trục ANG được nhập", () => {
    expect(total("frame_angle_ignored")).toBe(0);
    expect(total("frame_angle_imported")).toBe(34);
    // 34 cột xoay 90° (ANG 90): trục khoẻ quay sang phương kia.
    const rotated = model.frames.filter((f) => f.angle !== undefined);
    expect(new Set(rotated.map((f) => host(f.label))).size).toBe(34);
    expect(rotated.every((f) => f.kind === "column" && f.angle === 90)).toBe(true);
    expect(total("frame_cardinal_ignored")).toBe(60);
    expect(codesAt("error")).toEqual([]);
  });

  it("lò xo dọc dầm móng và lò xo nền dưới móng quy về lò xo nút, bảo toàn tổng độ cứng; mô hình có gối", () => {
    expect(total("frame_spring_unsupported")).toBe(0);
    expect(total("area_spring_unsupported")).toBe(0);
    expect(total("frame_spring_lumped")).toBe(24);
    expect(total("area_spring_lumped")).toBe(21);
    expect(total("spring_compression_only_linear")).toBe(2);
    expect(total("no_supports_imported")).toBe(0);
    // LINESPRING U2 = 4166.6665 lb/in² (dầm ngang: trục 2 = Z), AREASPRING U3 = 86.80556 lb/in³ (sàn ngang: trục 3 = Z).
    const kLine = (4166.6665 * LB) / IN ** 2;
    const kArea = (86.80556 * LB) / IN ** 3;
    const byId = new Map(model.joints.map((j) => [j.id, j]));
    const len = (f: (typeof model.frames)[number]) => {
      const [a, b] = [byId.get(f.i)!, byId.get(f.j)!];
      return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    };
    const area = (ids: string[]) => {
      const p = ids.map((id) => byId.get(id)!);
      let s2 = 0;
      p.forEach((q, k) => {
        const r = p[(k + 1) % p.length]!;
        s2 += q.x * r.y - r.x * q.y;
      });
      return Math.abs(s2) / 2;
    };
    // Danh sách đối tượng có SPRINGPROP lấy thẳng từ file (báo cáo chỉ liệt kê tối đa 20 tên).
    const f = parseE2k(text);
    const withSpring = (sec: string) => e2kSection(f, sec).filter((r) => r.tokens.some((t) => t.text === "SPRINGPROP")).map((r) => [r.tokens[1]!.text, r.tokens[2]!.text]);
    const label = (list: { label: string }[], [n, st]: string[]) => (list.some((o) => o.label === `${n}@${st}`) ? `${n}@${st}` : n!);
    const lineFrames = withSpring("LINE ASSIGNS").map((x) => label(model.frames, x));
    const areaShells = withSpring("AREA ASSIGNS").map((x) => label(model.shells, x));
    expect([lineFrames.length, areaShells.length]).toEqual([24, 21]);
    const sumL = model.frames.filter((f) => lineFrames.includes(f.label)).reduce((t, f) => t + len(f), 0);
    const sumA = model.shells.filter((x) => areaShells.includes(x.label)).reduce((t, x) => t + area(x.joints), 0);
    const kz = model.joints.reduce((t, j) => t + (j.springs?.[2] ?? 0), 0);
    expect(kz).toBeCloseTo(kLine * sumL + kArea * sumA, 3);
    // 108 nút góc móng và đầu dầm móng + 22 nút có thanh nằm bên trong tấm móng (chia tấm tại chỗ, như ETABS).
    expect(model.joints.filter((j) => j.springs).length).toBe(130);
  });

  it("chân cột C3 (nút 57) nằm giữa tấm móng F17: chia tấm tại chỗ, nút 57 nhận lò xo nền, tổng được giữ đúng", () => {
    const byId = new Map(model.joints.map((j) => [j.id, j]));
    const j57 = model.joints.find((j) => j.label === "57")!;
    const c3 = model.frames.find((f) => f.label === "C3")!;
    expect(c3.i).toBe(j57.id); // chân cột
    const f17 = model.shells.find((x) => x.label === "F17")!;
    expect(f17.joints).not.toContain(j57.id); // không phải góc tấm
    expect(diag("area_spring_interior_nodes").flatMap((x) => x.objects)).toContain("F17 (57)");
    // 150 kcf = 86.80556 lb/in³; nút 57 nhận phần diện tích của mình trên F17 (tấm lồi: quạt từ nút 57, mỗi tam giác 1/3).
    const kArea = (86.80556 * LB) / IN ** 3;
    const pts = f17.joints.map((id) => byId.get(id)!);
    let a2 = 0;
    pts.forEach((p, k) => { const q = pts[(k + 1) % pts.length]!; a2 += p.x * q.y - q.x * p.y; });
    const area = Math.abs(a2) / 2;
    expect(j57.springs![2]).toBeCloseTo((kArea * area) / 3, 6);
    expect(j57.springs![0]).toBeGreaterThan(0);
    // Tấm không bị thay đổi: vẫn 4 góc, tải mặt vẫn gán đúng một lần cho F17 (chia tấm chỉ dùng để quy lò xo).
    expect(f17.joints.length).toBe(4);
    const fileLoads = parseE2k(text).sections.get("SHELL OBJECT LOADS")!.filter((r) => r.tokens[1]?.text === "F17").length;
    expect(model.shellLoads.filter((l) => l.shell === f17.id).length).toBe(fileLoads);
  });

  it("mô hình hợp lệ theo schema; kiểm tra mô hình không còn lỗi", () => {
    const errors = checkModel(model).filter((i) => i.level === "error").map((i) => i.code);
    expect([...new Set(errors)]).toEqual([]);
  });

  it("nhập hai lần cho cùng kết quả (ổn định để so sánh và kiểm thử)", () => {
    expect(JSON.stringify(importE2k(text))).toBe(JSON.stringify({ model, report }));
  });
});
