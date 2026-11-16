/**
 * Sinh các ca đối chiếu giải tích: file SAP2000 `.s2k` nhỏ + `<id>.reference.json` (giá trị chuẩn từ công thức).
 *
 * Quan trọng — nguồn gốc:
 *  - Các file `.s2k` ở đây là TỔNG HỢP (synthetic), không xuất từ SAP2000. Tên bảng/trường lấy đúng theo file SAP2000
 *    thật trong tests/fixtures/csi/sap2000 (24061_OMF.s2k, Roof_model.2k); không dùng cú pháp suy đoán.
 *  - Giá trị chuẩn là nghiệm đóng (closed-form), KHÔNG phải kết quả ETABS/SAP2000. Ca đạt ở đây chỉ chứng minh:
 *    nhập file → mô hình NexFEM → bộ giải khớp lý thuyết. Không chứng minh tương đương CSI.
 *
 * Chạy lại:  node tests/benchmarks/csi/generate-cases.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "cases");

// Vật liệu và tiết diện (kN, m): thép E = 2e8 kN/m², chữ nhật 0.2 × 0.4 (uốn quanh trục 3, I33 = b·h³/12).
const E = 2.0e8;
const B = 0.2;
const H = 0.4;
const EI = (E * B * H ** 3) / 12;
const EI22 = (E * H * B ** 3) / 12;
const L = 6;

const header = (name) => `File ${name}.$2k was saved on m/d/yy at h:mm:ss

TABLE:  "PROGRAM CONTROL"
   ProgramName=SAP2000   Version=23.1.0   CurrUnits="kN, m, C"

TABLE:  "ACTIVE DEGREES OF FREEDOM"
   UX=Yes   UY=Yes   UZ=Yes   RX=Yes   RY=Yes   RZ=Yes

TABLE:  "MATERIAL PROPERTIES 01 - GENERAL"
   Material=STEEL   Type=Steel   SymType=Isotropic

TABLE:  "MATERIAL PROPERTIES 02 - BASIC MECHANICAL PROPERTIES"
   Material=STEEL   UnitWeight=0   E1=${E}   U12=0.3

TABLE:  "FRAME SECTION PROPERTIES 01 - GENERAL"
   SectionName=R200X400   Material=STEEL   Shape=Rectangular   t3=${H}   t2=${B}

`;
const table = (title, rows) => `TABLE:  "${title}"\n${rows.map((r) => "   " + r).join("\n")}\n\n`;
const joint = (id, x, y, z) => `Joint=${id}   CoordSys=GLOBAL   CoordType=Cartesian   XorR=${x}   Y=${y}   Z=${z}   SpecialJt=No`;
const frame = (id, i, j) => `Frame=${id}   JointI=${i}   JointJ=${j}   IsCurved=No`;
const restraint = (id, ...f) => `Joint=${id}   ${["U1", "U2", "U3", "R1", "R2", "R3"].map((k, n) => `${k}=${f[n] ? "Yes" : "No"}`).join("   ")}`;
const FIXED = [1, 1, 1, 1, 1, 1];
const PINNED = [1, 1, 1, 1, 0, 0]; // giữ thêm xoắn quanh trục dầm
const ROLLER = [0, 1, 1, 1, 0, 0];
const sections = (ids) => ids.map((i) => `Frame=${i}   AutoSelect=N.A.   AnalSect=R200X400   MatProp=Default`);
const patterns = (...names) =>
  table("LOAD PATTERN DEFINITIONS", names.map((n) => `LoadPat=${n}   DesignType=Other   SelfWtMult=0`)) +
  table("LOAD CASE DEFINITIONS", names.map((n) => `Case=${n}   Type=LinStatic   InitialCond=Zero   RunCase=Yes`)) +
  table("CASE - STATIC 1 - LOAD ASSIGNMENTS", names.map((n) => `Case=${n}   LoadType="Load pattern"   LoadName=${n}   LoadSF=1`));
const udl = (f, p, w) =>
  `Frame=${f}   LoadPat=${p}   CoordSys=GLOBAL   Type=Force   Dir=Gravity   DistType=RelDist   RelDistA=0   RelDistB=1   AbsDistA=0   AbsDistB=0   FOverLA=${w}   FOverLB=${w}`;
const jointForce = (id, p, f1, f2, f3) => `Joint=${id}   LoadPat=${p}   CoordSys=GLOBAL   F1=${f1}   F2=${f2}   F3=${f3}   M1=0   M2=0   M3=0`;

/** metric(case, kind, object, component, value, absTol, relTol) */
const m = (kase, kind, object, component, value, absTol, relTol) => ({ case: kase, kind, object, component, value, absTol, relTol });
// Nghiệm đóng là chính xác với phần tử dầm Euler–Bernoulli: chỉ còn sai số làm tròn số học.
const ABS_D = 1e-10; // m, rad
const ABS_F = 1e-8; // kN, kN·m
const REL = 1e-6;
const disp = (c, o, comp, v, a = ABS_D, r = REL) => ({ ...m(c, "displacement", o, comp, v, a, r) });
const reac = (c, o, comp, v, a = ABS_F, r = REL) => ({ ...m(c, "reaction", o, comp, v, a, r) });
const mom = (c, frameLabel, x, v, a = ABS_F, r = REL) => ({ ...m(c, "frameForce", `${frameLabel}@x=${x}`, "M3", v, a, r) });

const cases = [];
const add = (id, description, basis, classification, body, metrics, limitations = []) => {
  cases.push({ id, description, basis, classification, body, limitations, metrics });
};

{
  const P = 10;
  add(
    "cantilever-tip-load",
    "Công xôn L = 6 m dọc +X. Hai ca độc lập đặt 10 kN tại đầu tự do: P theo −Z, PY theo +Y.",
    "P: Uz = −PL³/(3EI33), θy = PL²/(2EI33), Fz = P, My = −PL, M3(x) = −P(L−x). " +
      "PY: Uy = PL³/(3EI22), θz = PL²/(2EI22), Fy = −P, Mz = −PL. " +
      "Trục địa phương 2 = +Z và 3 = −Y, nên nội lực NexFEM trên mặt cắt dương là M2(x) = P(L−x) và V3(x) = −P.",
    "analytic-exact",
    tableSet(
      [joint(1, 0, 0, 0), joint(2, L, 0, 0)],
      [frame(1, 1, 2)],
      [restraint(1, ...FIXED)],
      [1],
      table("FRAME OUTPUT STATION ASSIGNMENTS", ["Frame=1   StationType=MinNumSta   MinNumSta=3   AddAtElmInt=Yes   AddAtPtLoad=Yes"]) +
        patterns("P", "PY") + table("JOINT LOADS - FORCE", [jointForce(2, "P", 0, 0, -P), jointForce(2, "PY", 0, P, 0)]),
    ),
    [
      disp("P", "2", "U3", (-P * L ** 3) / (3 * EI)),
      disp("P", "2", "R2", (P * L ** 2) / (2 * EI)),
      reac("P", "1", "F3", P),
      reac("P", "1", "M2", -P * L),
      mom("P", "1", 0, -P * L),
      mom("P", "1", L / 2, (-P * L) / 2),
      mom("P", "1", L, 0),
      disp("PY", "2", "U2", (P * L ** 3) / (3 * EI22)),
      disp("PY", "2", "R3", (P * L ** 2) / (2 * EI22)),
      reac("PY", "1", "F2", -P),
      reac("PY", "1", "M3", -P * L),
      m("PY", "frameForce", "1@x=0", "M2", P * L, ABS_F, REL),
      m("PY", "frameForce", `1@x=${L / 2}`, "M2", (P * L) / 2, ABS_F, REL),
      m("PY", "frameForce", `1@x=${L}`, "M2", 0, ABS_F, REL),
      m("PY", "frameForce", `1@x=${L / 2}`, "V3", -P, ABS_F, REL),
    ],
  );
}
{
  const w = 5;
  add(
    "simply-supported-udl",
    "Dầm đơn giản L = 6 m, tải phân bố đều w = 5 kN/m hướng xuống (gối khớp + gối trượt dọc trục).",
    "R = wL/2; θ(0) = +wL³/24EI, θ(L) = −wL³/24EI; M3(x) = wx(L−x)/2 (căng thớ dưới là dương).",
    "analytic-exact",
    tableSet([joint(1, 0, 0, 0), joint(2, L, 0, 0)], [frame(1, 1, 2)], [restraint(1, ...PINNED), restraint(2, ...ROLLER)], [1],
      patterns("W") + table("FRAME LOADS - DISTRIBUTED", [udl(1, "W", w)])),
    [
      reac("W", "1", "F3", (w * L) / 2),
      reac("W", "2", "F3", (w * L) / 2),
      disp("W", "1", "R2", (w * L ** 3) / (24 * EI)),
      disp("W", "2", "R2", (-w * L ** 3) / (24 * EI)),
      mom("W", "1", L / 4, (w * (L / 4) * (L - L / 4)) / 2),
      mom("W", "1", L / 2, (w * L ** 2) / 8),
      mom("W", "1", L, 0),
    ],
  );
}
{
  const P = 20;
  add(
    "fixed-fixed-midspan-point",
    "Dầm hai đầu ngàm L = 6 m, lực tập trung P = 20 kN hướng xuống tại giữa nhịp (hai thanh nối tại nút giữa).",
    "δ = PL³/192EI; Fz = P/2; mômen ngàm = PL/8 (hogging; My = −PL/8 ở đầu trái, +PL/8 ở đầu phải); M3 giữa nhịp = +PL/8.",
    "analytic-exact",
    tableSet([joint(1, 0, 0, 0), joint(2, L / 2, 0, 0), joint(3, L, 0, 0)], [frame(1, 1, 2), frame(2, 2, 3)],
      [restraint(1, ...FIXED), restraint(3, ...FIXED)], [1, 2], patterns("P") + table("JOINT LOADS - FORCE", [jointForce(2, "P", 0, 0, -P)])),
    [
      disp("P", "2", "U3", (-P * L ** 3) / (192 * EI)),
      reac("P", "1", "F3", P / 2),
      reac("P", "3", "F3", P / 2),
      reac("P", "1", "M2", (-P * L) / 8),
      reac("P", "3", "M2", (P * L) / 8),
      mom("P", "1", 0, (-P * L) / 8),
      mom("P", "1", L / 2, (P * L) / 8),
    ],
  );
}
{
  const Hh = 10;
  const h = 4;
  const Lb = 6;
  const x = (6 * h) / Lb;
  const sway = (Hh * h ** 3 * (4 + x)) / (24 * EI * (1 + x));
  const psi = sway / h;
  const theta = (6 * psi) / (4 + x);
  const Mb = ((2 * EI) / h) * (theta - 3 * psi); // mômen chân cột (âm)
  const Rz = (Hh * h + 2 * Mb) / Lb; // phản lực đứng cột phải (lật): (H·h − 2|Mb|)/L
  add(
    "portal-lateral",
    "Khung cổng một nhịp: cột h = 4 m, dầm L = 6 m, cùng EI, chân ngàm; lực ngang H = 10 kN tại nút trên trái (3D, trong mặt phẳng XZ).",
    "Phương trình góc xoay-độ võng, bỏ qua biến dạng dọc trục: θ = 6ψ/(4+6h/L), Δ = H·h³(4+x)/(24EI(1+x)) với x = 6h/L, " +
      "M chân cột = 2EI/h·(θ − 3ψ). Tổng phản lực ngang = −H (cân bằng, chính xác).",
    "analytic-approximate",
    tableSet([joint(1, 0, 0, 0), joint(2, 0, 0, h), joint(3, Lb, 0, h), joint(4, Lb, 0, 0)], [frame(1, 1, 2), frame(2, 2, 3), frame(3, 4, 3)],
      [restraint(1, ...FIXED), restraint(4, ...FIXED)], [1, 2, 3], patterns("H") + table("JOINT LOADS - FORCE", [jointForce(2, "H", Hh, 0, 0)])),
    [
      // Công thức đóng bỏ qua co ngắn dọc trục của dầm: N_dầm ≈ H/2, δN = N·L/EA ≈ 1.9e-6 m ≈ 0.94% của Δ. Dung sai 1% theo chặn trên này.
      disp("H", "mean(2,3)", "U1", sway, 1e-9, 0.01),
      reac("H", "sum(1,4)", "F1", -Hh, ABS_F, REL),
      reac("H", "sum(1,4)", "F3", 0, ABS_F, REL),
      reac("H", "mean(1,4)", "M2", Mb, 1e-6, 0.01),
      reac("H", "4", "F3", Rz, 1e-6, 0.01),
    ],
    ["Công thức đóng bỏ qua biến dạng dọc trục; mô hình NexFEM có kể dọc trục nên chênh ≤ ~1%. Đây là chênh lệch giả thiết mô hình, không phải sai số bộ giải."],
  );
}
{
  const w = 5;
  add(
    "cantilever-hinge-span",
    "Hai nhịp 6 m: thanh 1 ngàm tại nút 1, thanh 2 có nhả mômen M3 ở đầu I (khớp tại nút 2), gối khớp tại nút 3; tải đều w = 5 kN/m cả hai thanh.",
    "Tĩnh định: thanh 2 là dầm đơn giản (phản lực wL/2 truyền xuống đầu thanh 1). Fz(1) = 1.5wL; M ngàm = −wL²; " +
      "δ(2) = −(wL⁴/8EI + (wL/2)L³/3EI) = −7wL⁴/24EI; θy(2) = 5wL³/12EI; θy(3) = −wL³/3EI; M3 khớp = 0; M3 giữa thanh 2 = wL²/8.",
    "analytic-exact",
    tableSet([joint(1, 0, 0, 0), joint(2, L, 0, 0), joint(3, 2 * L, 0, 0)], [frame(1, 1, 2), frame(2, 2, 3)],
      [restraint(1, ...FIXED), restraint(3, ...PINNED)], [1, 2],
      table("FRAME RELEASE ASSIGNMENTS 1 - GENERAL", [
        "Frame=2   PI=No   V2I=No   V3I=No   TI=No   M2I=No   M3I=Yes   PJ=No   V2J=No   V3J=No   TJ=No   M2J=No   M3J=No",
      ]) + patterns("W") + table("FRAME LOADS - DISTRIBUTED", [udl(1, "W", w), udl(2, "W", w)])),
    [
      disp("W", "2", "U3", (-7 * w * L ** 4) / (24 * EI)),
      disp("W", "2", "R2", (5 * w * L ** 3) / (12 * EI)),
      disp("W", "3", "R2", (-w * L ** 3) / (3 * EI)),
      reac("W", "1", "F3", 1.5 * w * L),
      reac("W", "1", "M2", -w * L ** 2),
      reac("W", "3", "F3", (w * L) / 2),
      mom("W", "1", 0, -w * L ** 2),
      mom("W", "2", 0, 0),
      mom("W", "2", L / 2, (w * L ** 2) / 8),
    ],
  );
}

function tableSet(joints, frames, restraints, sectionFrames, rest) {
  return (
    table("JOINT COORDINATES", joints) +
    table("CONNECTIVITY - FRAME", frames) +
    table("JOINT RESTRAINT ASSIGNMENTS", restraints) +
    table("FRAME SECTION ASSIGNMENTS", sections(sectionFrames)) +
    rest
  );
}

for (const c of cases) {
  const text = (header(c.id) + c.body + "END TABLE DATA\n").replace(/\n/g, "\r\n");
  writeFileSync(join(out, `${c.id}.s2k`), text);
  const ref = {
    schema: 1,
    id: c.id,
    description: c.description,
    file: `${c.id}.s2k`,
    provenance: {
      input: "synthetic: SAP2000 text tables written by hand from the grammar of real SAP2000 files in tests/fixtures/csi/sap2000; NOT exported from SAP2000",
      reference: "closed-form analytic solution; NOT ETABS/SAP2000 results",
    },
    basis: c.basis,
    classification: c.classification,
    limitations: c.limitations,
    source: { program: "analytic", version: "closed-form" },
    units: { force: "kN", length: "m" },
    metrics: c.metrics,
  };
  writeFileSync(join(out, `${c.id}.reference.json`), JSON.stringify(ref, null, 2) + "\n");
}
console.log(`đã ghi ${cases.length} ca vào ${out}`);
