import { applyPatches, enablePatches, produceWithPatches, type Patch } from "immer";
import { z } from "zod";
import { nextLabel } from "./query.ts";
import {
  COLLECTIONS,
  FrameSchema,
  FrameSectionSchema,
  MaterialSchema,
  RestraintSchema,
  UnitSystemSchema,
  type CollectionName,
  type Model,
} from "./schema.ts";

enablePatches();

/**
 * Một lệnh thao tác trên mô hình. Giao diện, console, API và MCP đều chạy lệnh qua registry này,
 * nên mọi thay đổi đều có Undo/Redo và được kiểm tra đầu vào bằng schema.
 */
export interface CommandDef<A = unknown> {
  name: string;
  /** Mô tả ngắn, hiện trong lịch sử Undo và nhật ký. */
  title: string;
  /** Lệnh có làm thay đổi mô hình không (false = chỉ đọc). */
  mutates: boolean;
  args: z.ZodType<A>;
  /** Sửa trực tiếp bản nháp (immer). Có thể trả về giá trị kết quả, ví dụ id mới tạo. */
  run(draft: Model, args: A): unknown;
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

const registry = new Map<string, CommandDef<never>>();

export function defineCommand<A>(def: CommandDef<A>): CommandDef<A> {
  if (registry.has(def.name)) throw new Error(`Lệnh ${def.name} đã được đăng ký`);
  registry.set(def.name, def as unknown as CommandDef<never>);
  return def;
}

export function getCommand(name: string): CommandDef<unknown> | undefined {
  return registry.get(name) as CommandDef<unknown> | undefined;
}

export function listCommands(): { name: string; title: string; mutates: boolean; argsSchema: unknown }[] {
  return [...registry.values()].map((c) => ({
    name: c.name,
    title: c.title,
    mutates: c.mutates,
    argsSchema: z.toJSONSchema(c.args as z.ZodType, { unrepresentable: "any" }),
  }));
}

interface HistoryEntry {
  name: string;
  title: string;
  patches: Patch[];
  inverse: Patch[];
}

export interface BatchResult {
  model: Model;
  results: unknown[];
  changed: boolean;
}

export interface ExecuteResult {
  model: Model;
  result: unknown;
  changed: boolean;
}

/** Ngăn xếp lệnh: giữ mô hình hiện tại và lịch sử Undo/Redo. */
export class CommandStack {
  #model: Model;
  #undo: HistoryEntry[] = [];
  #redo: HistoryEntry[] = [];
  readonly limit: number;

  constructor(model: Model, limit = 200) {
    this.#model = model;
    this.limit = limit;
  }

  get model(): Model {
    return this.#model;
  }
  get canUndo(): boolean {
    return this.#undo.length > 0;
  }
  get canRedo(): boolean {
    return this.#redo.length > 0;
  }
  get undoTitle(): string | undefined {
    return this.#undo.at(-1)?.title;
  }
  get redoTitle(): string | undefined {
    return this.#redo.at(-1)?.title;
  }

  /** Thay toàn bộ mô hình (mở file, tạo mới) và xoá lịch sử. */
  reset(model: Model): void {
    this.#model = model;
    this.#undo = [];
    this.#redo = [];
  }

  execute(name: string, rawArgs: unknown): ExecuteResult {
    const def = getCommand(name);
    const r = this.executeBatch(def?.title ?? name, [{ name, args: rawArgs }]);
    return { model: r.model, result: r.results[0], changed: r.changed };
  }

  /**
   * Chạy nhiều lệnh trên cùng một bản nháp và ghi thành MỘT bước Undo (dùng cho nút OK/Apply của hộp thoại).
   * Lệnh nào lỗi thì cả lô bị huỷ, mô hình giữ nguyên.
   */
  executeBatch(title: string, ops: { name: string; args: unknown }[]): BatchResult {
    const prepared = ops.map((op) => {
      const def = getCommand(op.name);
      if (!def) throw new CommandError(`Không có lệnh "${op.name}"`, "unknown_command");
      const parsed = def.args.safeParse(op.args ?? {});
      if (!parsed.success) {
        throw new CommandError(`Tham số không hợp lệ cho ${op.name}: ${z.prettifyError(parsed.error)}`, "invalid_args");
      }
      return { def, args: parsed.data };
    });
    const results: unknown[] = [];
    const [next, patches, inverse] = produceWithPatches(this.#model, (draft) => {
      for (const { def, args } of prepared) results.push(def.run(draft as Model, args));
    });
    if (patches.length === 0) return { model: this.#model, results, changed: false };
    this.#model = next;
    const name = ops.length === 1 ? ops[0]!.name : "batch";
    this.#undo.push({ name, title, patches, inverse });
    if (this.#undo.length > this.limit) this.#undo.shift();
    this.#redo = [];
    return { model: next, results, changed: true };
  }

  undo(): boolean {
    const e = this.#undo.pop();
    if (!e) return false;
    this.#model = applyPatches(this.#model, e.inverse);
    this.#redo.push(e);
    return true;
  }

  redo(): boolean {
    const e = this.#redo.pop();
    if (!e) return false;
    this.#model = applyPatches(this.#model, e.patches);
    this.#undo.push(e);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Lệnh dựng sẵn
// ---------------------------------------------------------------------------

const Point = z.tuple([z.number(), z.number(), z.number()]);
const TOL = 1e-6;

function findOrAddJoint(draft: Model, p: [number, number, number], story?: string): string {
  const hit = draft.joints.find((j) => Math.abs(j.x - p[0]) < TOL && Math.abs(j.y - p[1]) < TOL && Math.abs(j.z - p[2]) < TOL);
  if (hit) return hit.id;
  const label = nextLabel(
    draft.joints.map((j) => j.label),
    "",
  );
  let id = `j${label}`;
  while (draft.joints.some((j) => j.id === id)) id += "_";
  draft.joints.push({ id, label, x: p[0], y: p[1], z: p[2], ...(story ? { story } : {}) });
  return id;
}

function requireIn(draft: Model, collection: CollectionName, id: string): void {
  if (!(draft[collection] as { id: string }[]).some((o) => o.id === id)) {
    throw new CommandError(`Không tìm thấy ${id} trong ${collection}`, "not_found");
  }
}

export const commands = {
  setName: defineCommand({
    name: "model.setName",
    title: "Đổi tên mô hình",
    mutates: true,
    args: z.object({ name: z.string().min(1) }),
    run(d, a) {
      d.name = a.name;
    },
  }),

  setUnits: defineCommand({
    name: "model.setUnits",
    title: "Đổi đơn vị hiển thị",
    mutates: true,
    args: z.object({ units: UnitSystemSchema }),
    run(d, a) {
      d.units = a.units;
    },
  }),

  addMaterial: defineCommand({
    name: "material.add",
    title: "Thêm vật liệu",
    mutates: true,
    args: MaterialSchema,
    run(d, a) {
      if (d.materials.some((m) => m.id === a.id || m.name === a.name)) {
        throw new CommandError(`Vật liệu ${a.name} đã tồn tại`, "duplicate");
      }
      d.materials.push(a);
      return a.id;
    },
  }),

  addFrameSection: defineCommand({
    name: "frameSection.add",
    title: "Thêm tiết diện thanh",
    mutates: true,
    args: FrameSectionSchema,
    run(d, a) {
      if (d.frameSections.some((s) => s.id === a.id || s.name === a.name)) {
        throw new CommandError(`Tiết diện ${a.name} đã tồn tại`, "duplicate");
      }
      requireIn(d, "materials", a.material);
      d.frameSections.push(a);
      return a.id;
    },
  }),

  addFrame: defineCommand({
    name: "frame.add",
    title: "Vẽ thanh",
    mutates: true,
    args: z.object({
      kind: FrameSchema.shape.kind,
      from: Point,
      to: Point,
      section: z.string(),
      story: z.string().optional(),
    }),
    run(d, a) {
      if (Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1], a.to[2] - a.from[2]) < TOL) {
        throw new CommandError("Thanh có chiều dài bằng 0", "zero_length");
      }
      requireIn(d, "frameSections", a.section);
      const i = findOrAddJoint(d, a.from, a.story);
      const j = findOrAddJoint(d, a.to, a.story);
      if (d.frames.some((f) => (f.i === i && f.j === j) || (f.i === j && f.j === i))) {
        throw new CommandError("Đã có thanh nối hai điểm này", "duplicate");
      }
      const prefix = a.kind === "column" ? "C" : a.kind === "beam" ? "B" : "D";
      const label = nextLabel(
        d.frames.map((f) => f.label),
        prefix,
      );
      const id = `f-${label}-${d.frames.length}`;
      d.frames.push({ id, label, kind: a.kind, i, j, section: a.section, ...(a.story ? { story: a.story } : {}) });
      return id;
    },
  }),

  assignSection: defineCommand({
    name: "frame.assignSection",
    title: "Gán tiết diện",
    mutates: true,
    args: z.object({ frames: z.array(z.string()).min(1), section: z.string() }),
    run(d, a) {
      requireIn(d, "frameSections", a.section);
      const set = new Set(a.frames);
      let n = 0;
      for (const f of d.frames) if (set.has(f.id)) (f.section = a.section), n++;
      return n;
    },
  }),

  assignRestraint: defineCommand({
    name: "joint.assignRestraint",
    title: "Gán liên kết gối",
    mutates: true,
    args: z.object({ joints: z.array(z.string()).min(1), restraint: RestraintSchema }),
    run(d, a) {
      const set = new Set(a.joints);
      let n = 0;
      for (const j of d.joints) {
        if (!set.has(j.id)) continue;
        if (a.restraint.some(Boolean)) j.restraint = a.restraint;
        else delete j.restraint;
        n++;
      }
      return n;
    },
  }),

  updateObject: defineCommand({
    name: "object.update",
    title: "Sửa thuộc tính",
    mutates: true,
    args: z.object({
      collection: z.enum(COLLECTIONS),
      id: z.string(),
      patch: z.record(z.string(), z.unknown()),
    }),
    run(d, a) {
      const list = d[a.collection] as Record<string, unknown>[];
      const obj = list.find((o) => o.id === a.id);
      if (!obj) throw new CommandError(`Không tìm thấy ${a.id}`, "not_found");
      if ("id" in a.patch) throw new CommandError("Không được đổi id", "invalid_args");
      Object.assign(obj, a.patch);
    },
  }),

  deleteObjects: defineCommand({
    name: "objects.delete",
    title: "Xoá đối tượng",
    mutates: true,
    args: z.object({ ids: z.array(z.string()).min(1) }),
    run(d, a) {
      const ids = new Set(a.ids);
      const before = d.frames.length + d.shells.length + d.joints.length;
      d.frames = d.frames.filter((f) => !ids.has(f.id));
      d.shells = d.shells.filter((s) => !ids.has(s.id));
      d.frameLoads = d.frameLoads.filter((l) => !ids.has(l.frame) && !ids.has(l.id));
      d.shellLoads = d.shellLoads.filter((l) => !ids.has(l.shell) && !ids.has(l.id));
      // Nút chỉ xoá được khi không còn phần tử nào dùng.
      const used = new Set<string>();
      for (const f of d.frames) used.add(f.i).add(f.j);
      for (const s of d.shells) for (const j of s.joints) used.add(j);
      d.joints = d.joints.filter((j) => !ids.has(j.id) || used.has(j.id));
      return before - (d.frames.length + d.shells.length + d.joints.length);
    },
  }),
};
