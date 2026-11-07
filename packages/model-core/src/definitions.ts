import { z } from "zod";
import { CommandError, defineCommand } from "./commands.ts";
import {
  FrameSectionSchema,
  GridSystemSchema,
  LoadCaseSchema,
  LoadComboSchema,
  LoadPatternSchema,
  MaterialSchema,
  ShellSectionSchema,
  StorySchema,
  type Model,
} from "./schema.ts";

/** Các bộ sưu tập "định nghĩa" sửa được qua hộp thoại Define. */
export const DEFINITION_COLLECTIONS = ["materials", "frameSections", "shellSections", "loadPatterns", "loadCases", "combos"] as const;
export type DefinitionCollection = (typeof DEFINITION_COLLECTIONS)[number];

const itemSchemas = {
  materials: MaterialSchema,
  frameSections: FrameSectionSchema,
  shellSections: ShellSectionSchema,
  loadPatterns: LoadPatternSchema,
  loadCases: LoadCaseSchema,
  combos: LoadComboSchema,
} as const;

const TOL = 1e-6;

type Named = { id: string; name: string };

function has(list: { id: string }[], id: string) {
  return list.some((o) => o.id === id);
}

/** Kiểm tra tham chiếu của một định nghĩa tới định nghĩa khác. */
function checkRefs(d: Model, collection: DefinitionCollection, item: Record<string, unknown>): void {
  const need = (ok: boolean, what: string) => {
    if (!ok) throw new CommandError(`${String(item.name)}: không tìm thấy ${what}`, "missing_reference");
  };
  switch (collection) {
    case "frameSections":
    case "shellSections":
      need(has(d.materials, item.material as string), `vật liệu ${String(item.material)}`);
      break;
    case "loadCases":
      for (const l of (item.loads as { pattern: string }[]) ?? []) need(has(d.loadPatterns, l.pattern), `mẫu tải ${l.pattern}`);
      break;
    case "combos":
      for (const it of item.items as { case: string }[]) {
        need(has(d.loadCases, it.case) || has(d.combos, it.case), `trường hợp tải ${it.case}`);
        if (it.case === item.id) throw new CommandError(`${String(item.name)}: tổ hợp không được chứa chính nó`, "invalid_args");
      }
      break;
    default:
      break;
  }
}

/** Danh sách nơi đang dùng một định nghĩa (để chặn xoá). */
export function definitionUsages(d: Model, collection: DefinitionCollection, id: string): string[] {
  switch (collection) {
    case "materials":
      return [...d.frameSections, ...d.shellSections].filter((s) => s.material === id).map((s) => s.name);
    case "frameSections":
      return d.frames.filter((f) => f.section === id).map((f) => f.label);
    case "shellSections":
      return d.shells.filter((s) => s.section === id).map((s) => s.label);
    case "loadPatterns":
      return [
        ...d.loadCases.filter((c) => c.loads.some((l) => l.pattern === id)).map((c) => c.name),
        ...(d.frameLoads.some((l) => l.pattern === id) || d.shellLoads.some((l) => l.pattern === id) ? ["tải đã gán"] : []),
      ];
    case "loadCases":
    case "combos":
      return d.combos.filter((c) => c.id !== id && c.items.some((i) => i.case === id)).map((c) => c.name);
  }
}

export const definitionCommands = {
  setDesignCodes: defineCommand({
    name: "model.setDesignCodes",
    title: "Đổi tiêu chuẩn thiết kế",
    mutates: true,
    args: z.object({ concrete: z.string().optional(), steel: z.string().optional(), loads: z.string().optional() }),
    run(d, a) {
      for (const k of ["concrete", "steel", "loads"] as const) {
        if (!(k in a)) continue;
        if (a[k]) d.designCodes[k] = a[k];
        else delete d.designCodes[k];
      }
    },
  }),

  upsert: defineCommand({
    name: "definition.upsert",
    title: "Lưu định nghĩa",
    mutates: true,
    args: z.object({ collection: z.enum(DEFINITION_COLLECTIONS), item: z.record(z.string(), z.unknown()) }),
    run(d, a) {
      const parsed = itemSchemas[a.collection].safeParse(a.item);
      if (!parsed.success) throw new CommandError(`Dữ liệu không hợp lệ: ${z.prettifyError(parsed.error)}`, "invalid_args");
      const item = parsed.data as Named & Record<string, unknown>;
      const list = d[a.collection] as (Named & Record<string, unknown>)[];
      if (!item.name.trim()) throw new CommandError("Tên không được để trống", "invalid_args");
      if (list.some((o) => o.id !== item.id && o.name.trim().toLowerCase() === item.name.trim().toLowerCase())) {
        throw new CommandError(`Tên "${item.name}" đã có`, "duplicate");
      }
      checkRefs(d, a.collection, item);
      const idx = list.findIndex((o) => o.id === item.id);
      if (idx >= 0) list[idx] = item;
      else list.push(item);
      return item.id;
    },
  }),

  remove: defineCommand({
    name: "definition.delete",
    title: "Xoá định nghĩa",
    mutates: true,
    args: z.object({ collection: z.enum(DEFINITION_COLLECTIONS), id: z.string() }),
    run(d, a) {
      const list = d[a.collection] as Named[];
      const item = list.find((o) => o.id === a.id);
      if (!item) throw new CommandError(`Không tìm thấy ${a.id}`, "not_found");
      const used = definitionUsages(d, a.collection, a.id);
      if (used.length) {
        const shown = used.slice(0, 5).join(", ") + (used.length > 5 ? ` … (+${used.length - 5})` : "");
        throw new CommandError(`Không xoá được "${item.name}": đang dùng ở ${shown}`, "in_use");
      }
      (d[a.collection] as Named[]) = list.filter((o) => o.id !== a.id);
    },
  }),

  setGrid: defineCommand({
    name: "grid.set",
    title: "Sửa lưới trục",
    mutates: true,
    args: z.object({
      grid: GridSystemSchema,
      /** Dời các nút đang nằm trên trục khi đổi toạ độ trục (như "glue to grid"). */
      moveJoints: z.boolean().default(true),
    }),
    run(d, a) {
      const g = a.grid;
      for (const lines of [g.x, g.y]) {
        const labels = lines.map((l) => l.label.trim());
        if (labels.some((l) => !l)) throw new CommandError("Tên trục không được để trống", "invalid_args");
        const dup = labels.find((l, i) => labels.indexOf(l) !== i);
        if (dup) throw new CommandError(`Tên trục "${dup}" bị trùng`, "duplicate");
        const coords = lines.map((l) => l.coord).sort((p, q) => p - q);
        for (let i = 1; i < coords.length; i++) {
          if (coords[i]! - coords[i - 1]! < TOL) throw new CommandError("Hai trục trùng toạ độ", "duplicate");
        }
        lines.sort((p, q) => p.coord - q.coord);
      }
      const idx = d.grids.findIndex((x) => x.id === g.id);
      const old = idx >= 0 ? d.grids[idx]! : undefined;
      if (old && a.moveJoints) {
        const moves = (oldLines: typeof g.x, newLines: typeof g.x) =>
          oldLines
            .map((l) => ({ from: l.coord, to: newLines.find((n) => n.id === l.id)?.coord }))
            .filter((m): m is { from: number; to: number } => m.to !== undefined && Math.abs(m.to - m.from) > TOL);
        const mx = moves(old.x, g.x);
        const my = moves(old.y, g.y);
        // Tính trên toạ độ cũ để hai trục đổi chỗ cho nhau không bị dời hai lần.
        for (const j of d.joints) {
          const x0 = j.x;
          const y0 = j.y;
          const hx = mx.find((m) => Math.abs(x0 - m.from) < TOL);
          const hy = my.find((m) => Math.abs(y0 - m.from) < TOL);
          if (hx) j.x = hx.to;
          if (hy) j.y = hy.to;
        }
      }
      if (idx >= 0) d.grids[idx] = g;
      else d.grids.push(g);
    },
  }),

  setStories: defineCommand({
    name: "stories.set",
    title: "Sửa tầng",
    mutates: true,
    args: z.object({
      /** Từ dưới lên; phần tử đầu là chân công trình (Base). */
      stories: z.array(StorySchema.omit({ elevation: true })).min(1),
      baseElevation: z.number().default(0),
    }),
    run(d, a) {
      const names = a.stories.map((s) => s.name.trim());
      if (names.some((n) => !n)) throw new CommandError("Tên tầng không được để trống", "invalid_args");
      const dup = names.find((n, i) => names.indexOf(n) !== i);
      if (dup) throw new CommandError(`Tên tầng "${dup}" bị trùng`, "duplicate");
      if (a.stories.slice(1).some((s) => s.height <= 0)) throw new CommandError("Chiều cao tầng phải lớn hơn 0", "invalid_args");

      const keep = new Set(a.stories.map((s) => s.id));
      const removed = d.stories.filter((s) => !keep.has(s.id));
      for (const s of removed) {
        const used = d.joints.some((j) => j.story === s.id) || d.frames.some((f) => f.story === s.id) || d.shells.some((x) => x.story === s.id);
        if (used) throw new CommandError(`Không xoá được tầng "${s.name}": còn đối tượng`, "in_use");
      }

      let z = a.baseElevation;
      const next = a.stories.map((s, i) => {
        if (i > 0) z += s.height;
        const out = { ...s, height: i === 0 ? 0 : s.height, elevation: Math.round(z * 1e6) / 1e6 };
        if (out.similarTo && !keep.has(out.similarTo)) delete out.similarTo;
        return out;
      });
      const oldElev = new Map(d.stories.map((s) => [s.id, s.elevation]));
      const newElev = new Map(next.map((s) => [s.id, s.elevation]));
      for (const j of d.joints) {
        let sid = j.story;
        // Nút chưa gắn tầng nhưng nằm đúng cao độ tầng cũ cũng đi theo tầng đó.
        if (!sid) sid = [...oldElev].find(([, e]) => Math.abs(e - j.z) < TOL)?.[0];
        const ze = sid ? newElev.get(sid) : undefined;
        if (ze !== undefined) j.z = ze;
      }
      d.stories = next;
    },
  }),
};
