import { describe, expect, it } from "vitest";
import { REPORT_KINDS, buildReport, reportToCsv, sampleModel } from "../src/index.ts";

const m = sampleModel();

describe("báo cáo mô hình", () => {
  it("mọi loại báo cáo đều có cột và dòng khớp khoá cột", () => {
    for (const kind of REPORT_KINDS) {
      const r = buildReport(m, kind);
      expect(r.columns.length).toBeGreaterThan(1);
      expect(r.rows.length).toBeGreaterThan(0);
      for (const row of r.rows) for (const c of r.columns) expect(row).toHaveProperty(c.key);
    }
  });

  it("tóm tắt: đếm đúng đối tượng và tổng chiều dài thanh", () => {
    const rows = buildReport(m, "summary", { joints: "J", frames: "F", shells: "S" }).rows;
    const val = (item: string) => rows.find((r) => r.item === item)!.value;
    expect(val("J")).toBe(m.joints.length);
    expect(val("F")).toBe(m.frames.length);
    expect(val("S")).toBe(m.shells.length);
    const total = rows.find((r) => String(r.item).startsWith("totalFrameLength"))!.value as number;
    // Mẫu: 5 tầng, cột 4×3=12 mỗi tầng; tổng dài lấy từ dữ liệu, kiểm tra bậc độ lớn và dương.
    expect(total).toBeGreaterThan(500);
  });

  it("tiết diện: giá trị theo đơn vị hiển thị và đếm số thanh dùng tiết diện", () => {
    const mm = { ...m, units: { force: "N" as const, length: "mm" as const, temperature: "C" as const } };
    const kn = buildReport(m, "frameSections");
    const mmr = buildReport(mm, "frameSections");
    const col = kn.rows.find((r) => String(r.name).startsWith("C"))!;
    const colMm = mmr.rows.find((r) => String(r.name).startsWith("C"))!;
    // 400 × 400 mm: A = 0,16 m² = 160000 mm².
    expect(col.A).toBeCloseTo(0.16, 6);
    expect(colMm.A).toBeCloseTo(160000, 3);
    expect(kn.columns.find((c) => c.key === "A")!.label).toBe("A (m²)");
    expect(mmr.columns.find((c) => c.key === "A")!.label).toBe("A (mm²)");
    expect(kn.rows.reduce((s, r) => s + (r.count as number), 0)).toBe(m.frames.length);
  });

  it("tầng: từ trên xuống dưới, kèm số đối tượng mỗi tầng", () => {
    const r = buildReport(m, "stories");
    expect(r.rows[0]!.name).toBe(m.stories.at(-1)!.name);
    expect(r.rows.reduce((s, x) => s + (x.joints as number), 0)).toBe(m.joints.length);
  });

  it("tải: liệt kê mẫu tải, trường hợp và tổ hợp với định nghĩa dạng hệ số·tên", () => {
    const rows = buildReport(m, "loads").rows;
    expect(rows.some((r) => r.name === "SERVICE" && String(r.definition).includes("1·DL"))).toBe(true);
    expect(rows.length).toBe(m.loadPatterns.length + m.loadCases.length + m.combos.length);
  });

  it("CSV: có BOM, thoát dấu phẩy và ngoặc kép, dòng CRLF", () => {
    const csv = reportToCsv({
      kind: "summary",
      columns: [{ key: "a", label: "A, x" }, { key: "b", label: 'B "q"' }],
      rows: [{ a: "1,5", b: 'nói "có"' }, { a: 2, b: "" }],
    });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")).toEqual(['﻿"A, x","B ""q"""', '"1,5","nói ""có"""', "2,", ""]);
  });
});
