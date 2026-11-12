import { z } from "zod";
import { CommandError, defineCommand, requireIn } from "./commands.ts";
import { FrameLoadSchema, ShellLoadSchema, type Frame, type Model } from "./schema.ts";

const Bool6 = z.tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean(), z.boolean(), z.boolean()]);
/** Thứ tự thành phần nhả liên kết: [P, V2, V3, T, M2, M3]. */
export const RELEASE_LABELS = ["P", "V2", "V3", "T", "M2", "M3"] as const;

/** Mẫu nhả liên kết hay dùng. */
export const RELEASE_PRESETS = {
  none: null,
  pinnedBoth: { i: [false, false, false, false, true, true], j: [false, false, false, false, true, true] },
  pinnedStart: { i: [false, false, false, false, true, true], j: [false, false, false, false, false, false] },
  pinnedEnd: { i: [false, false, false, false, false, false], j: [false, false, false, false, true, true] },
} as const satisfies Record<string, Frame["releases"] | null>;

/**
 * Nhả cùng một thành phần lực dọc/cắt/xoắn ở cả hai đầu làm thanh mất ổn định.
 * Trả về tên các thành phần vi phạm.
 */
export function unstableReleases(r: { i: boolean[]; j: boolean[] }): string[] {
  return [0, 1, 2, 3].filter((k) => r.i[k] && r.j[k]).map((k) => RELEASE_LABELS[k]!);
}

function framesIn(d: Model, ids: string[]): Frame[] {
  const set = new Set(ids);
  const out = d.frames.filter((f) => set.has(f.id));
  if (!out.length) throw new CommandError("Chưa chọn thanh nào", "invalid_args");
  return out;
}

let seq = 0;
const loadId = (prefix: string, d: Model) => {
  const used = new Set([...d.frameLoads, ...d.shellLoads].map((l) => l.id));
  let id: string;
  do id = `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
  while (used.has(id));
  return id;
};

export const assignCommands = {
  offsets: defineCommand({
    name: "frame.assignOffsets",
    title: "Gán vùng cứng đầu thanh",
    mutates: true,
    args: z.object({
      frames: z.array(z.string()).min(1),
      offsets: z.object({ i: z.number().min(0), j: z.number().min(0) }),
    }),
    run(d, a) {
      const fs = framesIn(d, a.frames);
      const joints = new Map(d.joints.map((j) => [j.id, j]));
      for (const f of fs) {
        const i = joints.get(f.i), j = joints.get(f.j);
        if (!i || !j) throw new CommandError("Thanh tham chiếu tới nút không tồn tại", "invalid_args");
        const length = Math.hypot(j.x - i.x, j.y - i.y, j.z - i.z);
        if (a.offsets.i + a.offsets.j >= length - 1e-6)
          throw new CommandError(`Thanh ${f.label}: tổng vùng cứng vượt chiều dài hữu hiệu`, "invalid_args");
      }
      for (const f of fs) {
        if (a.offsets.i === 0 && a.offsets.j === 0) delete f.offsets;
        else f.offsets = { ...a.offsets };
      }
      return fs.length;
    },
  }),

  diaphragm: defineCommand({
    name: "diaphragm.set",
    title: "Gán diaphragm tuyệt đối cứng",
    mutates: true,
    args: z.object({ id: z.string().min(1), name: z.string().min(1), master: z.string(), slaves: z.array(z.string()).min(1) }),
    run(d, a) {
      const ids = [a.master, ...a.slaves];
      if (new Set(ids).size !== ids.length) throw new CommandError("Master/slave trùng nút", "invalid_args");
      const joints = new Map(d.joints.map((j) => [j.id, j]));
      const master = joints.get(a.master);
      if (!master) throw new CommandError("Master không tồn tại", "invalid_args");
      for (const id of a.slaves) {
        const slave = joints.get(id);
        if (!slave || Math.abs(slave.z - master.z) > 1e-6 || slave.restraint?.[0] || slave.restraint?.[1] || slave.restraint?.[5])
          throw new CommandError("Slave không hợp lệ: nút/cao độ/gối UX-UY-RZ", "invalid_args");
      }
      const other = (d.diaphragms ?? []).filter((x) => x.id !== a.id);
      if (other.some((x) => x.name.toLowerCase() === a.name.toLowerCase()))
        throw new CommandError("Tên diaphragm đã tồn tại", "duplicate");
      const claimed = new Set(other.flatMap((x) => [x.master, ...x.slaves]));
      if (ids.some((id) => claimed.has(id)))
        throw new CommandError("Nút đã thuộc một diaphragm khác", "invalid_args");
      d.diaphragms = [...other, { id: a.id, name: a.name, master: a.master, slaves: [...a.slaves] }];
      return a.id;
    },
  }),

  diaphragmRemove: defineCommand({
    name: "diaphragm.remove",
    title: "Xóa diaphragm",
    mutates: true,
    args: z.object({ id: z.string() }),
    run(d, a) { d.diaphragms = (d.diaphragms ?? []).filter((x) => x.id !== a.id); },
  }),

  releases: defineCommand({
    name: "frame.assignReleases",
    title: "Gán nhả liên kết",
    mutates: true,
    args: z.object({ frames: z.array(z.string()).min(1), releases: z.object({ i: Bool6, j: Bool6 }).nullable() }),
    run(d, a) {
      if (a.releases) {
        const bad = unstableReleases(a.releases);
        if (bad.length) throw new CommandError(`Nhả ${bad.join(", ")} ở cả hai đầu làm thanh mất ổn định`, "unstable");
      }
      const none = !a.releases || [...a.releases.i, ...a.releases.j].every((x) => !x);
      for (const f of framesIn(d, a.frames)) {
        if (none) delete f.releases;
        else f.releases = { i: [...a.releases!.i], j: [...a.releases!.j] };
      }
    },
  }),

  frameLoad: defineCommand({
    name: "frame.assignLoad",
    title: "Gán tải lên thanh",
    mutates: true,
    args: z.object({
      frames: z.array(z.string()).min(1),
      pattern: z.string(),
      kind: FrameLoadSchema.shape.kind,
      direction: FrameLoadSchema.shape.direction,
      value: z.number(),
      at: z.number().min(0).max(1).optional(),
      /** replace: xoá tải cùng mẫu tải trên các thanh trước; add: cộng thêm; delete: chỉ xoá. */
      mode: z.enum(["replace", "add", "delete"]).default("replace"),
    }),
    run(d, a) {
      requireIn(d, "loadPatterns", a.pattern);
      const frames = framesIn(d, a.frames);
      const ids = new Set(frames.map((f) => f.id));
      if (a.mode !== "add") d.frameLoads = d.frameLoads.filter((l) => !(ids.has(l.frame) && l.pattern === a.pattern));
      if (a.mode === "delete" || a.value === 0) return 0;
      if (a.kind === "point" && a.at === undefined) throw new CommandError("Tải tập trung cần vị trí (0..1)", "invalid_args");
      for (const f of frames) {
        d.frameLoads.push({
          id: loadId("fl", d),
          frame: f.id,
          pattern: a.pattern,
          kind: a.kind,
          direction: a.direction,
          value: a.value,
          ...(a.kind === "point" ? { at: a.at } : {}),
        });
      }
      return frames.length;
    },
  }),

  shellLoad: defineCommand({
    name: "shell.assignLoad",
    title: "Gán tải lên sàn/vách",
    mutates: true,
    args: z.object({
      shells: z.array(z.string()).min(1),
      pattern: z.string(),
      direction: ShellLoadSchema.shape.direction,
      value: z.number(),
      mode: z.enum(["replace", "add", "delete"]).default("replace"),
    }),
    run(d, a) {
      requireIn(d, "loadPatterns", a.pattern);
      const set = new Set(a.shells);
      const shells = d.shells.filter((s) => set.has(s.id));
      if (!shells.length) throw new CommandError("Chưa chọn sàn/vách nào", "invalid_args");
      if (a.mode !== "add") d.shellLoads = d.shellLoads.filter((l) => !(set.has(l.shell) && l.pattern === a.pattern));
      if (a.mode === "delete" || a.value === 0) return 0;
      for (const s of shells) d.shellLoads.push({ id: loadId("sl", d), shell: s.id, pattern: a.pattern, direction: a.direction, value: a.value });
      return shells.length;
    },
  }),
};
