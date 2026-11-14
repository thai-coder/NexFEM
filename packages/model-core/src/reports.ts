import { frameLength, jointMap } from "./query.ts";
import { sectionProperties } from "./sections.ts";
import { displayFactor, unitLabel, type Quantity } from "./units.ts";
import type { Model } from "./schema.ts";

/** Báo cáo mô hình: bảng tĩnh dựng từ mô hình hiện tại, dùng cho tab Reports và xuất CSV. */
export type ReportKind = "summary" | "materials" | "frameSections" | "stories" | "loads";

export const REPORT_KINDS: readonly ReportKind[] = ["summary", "materials", "frameSections", "stories", "loads"];

export interface ReportColumn {
  key: string;
  /** Nhãn cột đã kèm đơn vị, ví dụ "A (mm²)". */
  label: string;
  align?: "left" | "right";
}

export interface Report {
  kind: ReportKind;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
}

/** Chuỗi tiêu đề cột cho từng báo cáo; app cung cấp để dịch (vi/en). */
export type ReportLabels = Record<string, string>;

const SHAPE_NAME: Record<string, string> = { rect: "Rect", circle: "Circle", I: "I", box: "Box", pipe: "Pipe" };

const sig = (v: number, digits = 4) => Number(v.toPrecision(digits));

function qty(model: Model, q: Quantity) {
  const f = displayFactor(q, model.units);
  const u = unitLabel(q, model.units);
  return { conv: (v: number) => sig(v * f), unit: u, label: (name: string) => (u ? `${name} (${u})` : name) };
}

/**
 * Dựng báo cáo. `L` là nhãn cột theo ngôn ngữ giao diện; khoá thiếu thì dùng chính tên khoá.
 */
export function buildReport(model: Model, kind: ReportKind, L: ReportLabels = {}): Report {
  const t = (k: string) => L[k] ?? k;
  const left = (key: string): ReportColumn => ({ key, label: t(key), align: "left" });
  switch (kind) {
    case "summary": {
      const len = qty(model, "length");
      const joints = jointMap(model);
      const total = model.frames.reduce((s, f) => s + (frameLength(f, joints) || 0), 0);
      const rows: Report["rows"] = [
        { item: t("name"), value: model.name },
        { item: t("units"), value: `${model.units.force}, ${model.units.length}, ${model.units.temperature}` },
        ...Object.entries(model.designCodes ?? {}).map(([k, v]) => ({ item: `${t("code")} ${k}`, value: v })),
        { item: t("joints"), value: model.joints.length },
        { item: t("frames"), value: model.frames.length },
        { item: t("shells"), value: model.shells.length },
        { item: t("stories"), value: model.stories.length },
        { item: `${t("totalFrameLength")} (${len.unit})`, value: len.conv(total) },
        { item: t("materials"), value: model.materials.length },
        { item: t("frameSections"), value: model.frameSections.length },
        { item: t("loadPatterns"), value: model.loadPatterns.length },
        { item: t("loadCases"), value: model.loadCases.length },
        { item: t("combos"), value: model.combos.length },
        { item: t("frameLoads"), value: model.frameLoads.length },
        { item: t("shellLoads"), value: model.shellLoads.length },
      ];
      return { kind, columns: [left("item"), { key: "value", label: t("value"), align: "right" }], rows };
    }
    case "materials": {
      const stress = qty(model, "stress");
      const uw = qty(model, "unitWeight");
      return {
        kind,
        columns: [left("name"), left("type"), { key: "E", label: stress.label("E"), align: "right" }, { key: "nu", label: "ν", align: "right" }, { key: "gamma", label: uw.label("γ"), align: "right" }, { key: "strength", label: stress.label(t("strength")), align: "right" }, left("code")],
        rows: model.materials.map((m) => ({ name: m.name, type: m.type, E: stress.conv(m.E), nu: m.nu, gamma: uw.conv(m.gamma), strength: m.strength === undefined ? "" : stress.conv(m.strength), code: m.code ?? "" })),
      };
    }
    case "frameSections": {
      const area = qty(model, "area");
      const inertia = qty(model, "inertia");
      const mat = new Map(model.materials.map((m) => [m.id, m.name]));
      const used = new Map<string, number>();
      for (const f of model.frames) used.set(f.section, (used.get(f.section) ?? 0) + 1);
      return {
        kind,
        columns: [left("name"), left("shape"), left("material"), { key: "A", label: area.label("A"), align: "right" }, { key: "I33", label: inertia.label("I33"), align: "right" }, { key: "I22", label: inertia.label("I22"), align: "right" }, { key: "J", label: inertia.label("J"), align: "right" }, { key: "count", label: t("count"), align: "right" }],
        rows: model.frameSections.map((s) => {
          const p = sectionProperties(s.geometry);
          return { name: s.name, shape: SHAPE_NAME[s.geometry.shape] ?? s.geometry.shape, material: mat.get(s.material) ?? "?", A: area.conv(p.A), I33: inertia.conv(p.I33), I22: inertia.conv(p.I22), J: inertia.conv(p.J), count: used.get(s.id) ?? 0 };
        }),
      };
    }
    case "stories": {
      const len = qty(model, "length");
      const per = new Map<string, { joints: number; frames: number; shells: number }>();
      const bucket = (id: string | undefined) => {
        const k = id ?? "";
        if (!per.has(k)) per.set(k, { joints: 0, frames: 0, shells: 0 });
        return per.get(k)!;
      };
      for (const j of model.joints) bucket(j.story).joints++;
      for (const f of model.frames) bucket(f.story).frames++;
      for (const s of model.shells) bucket(s.story).shells++;
      return {
        kind,
        columns: [left("name"), { key: "elevation", label: len.label(t("elevation")), align: "right" }, { key: "height", label: len.label(t("height")), align: "right" }, { key: "joints", label: t("joints"), align: "right" }, { key: "frames", label: t("frames"), align: "right" }, { key: "shells", label: t("shells"), align: "right" }],
        rows: [...model.stories].reverse().map((s) => ({ name: s.name, elevation: len.conv(s.elevation), height: len.conv(s.height), joints: per.get(s.id)?.joints ?? 0, frames: per.get(s.id)?.frames ?? 0, shells: per.get(s.id)?.shells ?? 0 })),
      };
    }
    case "loads": {
      const pat = new Map(model.loadPatterns.map((p) => [p.id, p.name]));
      const cases = new Map(model.loadCases.map((c) => [c.id, c.name]));
      const rows: Report["rows"] = [
        ...model.loadPatterns.map((p) => ({ group: t("loadPatterns"), name: p.name, type: p.type, definition: `${t("selfWeight")} × ${p.selfWeight}` })),
        ...model.loadCases.map((c) => ({ group: t("loadCases"), name: c.name, type: c.type, definition: c.loads.map((l) => `${l.factor}·${pat.get(l.pattern) ?? "?"}`).join(" + ") })),
        ...model.combos.map((c) => ({ group: t("combos"), name: c.name, type: c.type, definition: c.items.map((i) => `${i.factor}·${cases.get(i.case) ?? model.combos.find((x) => x.id === i.case)?.name ?? "?"}`).join(" + ") })),
      ];
      return { kind, columns: [left("group"), left("name"), left("type"), left("definition")], rows };
    }
  }
}

/** CSV UTF-8 có BOM (Excel đọc đúng tiếng Việt); dấu phẩy, ngoặc kép khi cần, số theo dấu chấm thập phân. */
export function reportToCsv(r: Report): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [r.columns.map((c) => esc(c.label)).join(",")];
  for (const row of r.rows) lines.push(r.columns.map((c) => esc(row[c.key] ?? "")).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
