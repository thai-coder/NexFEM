import { z } from "zod";
import { CommandError, Point, defineCommand, findOrAddJoint, requireIn } from "./commands.ts";
import { nextLabel } from "./query.ts";
import type { Frame, Model, Shell, Story } from "./schema.ts";

type P3 = [number, number, number];
type P2 = [number, number];
const TOL = 1e-6;

/** Tầng có cao độ đúng bằng z (nếu có). */
export function storyAt(model: Model, z: number): Story | undefined {
  return model.stories.find((s) => Math.abs(s.elevation - z) < 1e-4);
}

/** Tầng ngay bên dưới một tầng. */
export function storyBelow(model: Model, storyId: string): Story | undefined {
  const sorted = [...model.stories].sort((a, b) => a.elevation - b.elevation);
  const i = sorted.findIndex((s) => s.id === storyId);
  return i > 0 ? sorted[i - 1] : undefined;
}

export type StoryScope = "one" | "similar" | "all";

/**
 * Các tầng sẽ nhận đối tượng khi vẽ trên `storyId`:
 *  - one: chỉ tầng đó;
 *  - similar: tầng đó và các tầng cùng nhóm "giống tầng" (cùng tầng chuẩn);
 *  - all: mọi tầng (trừ chân công trình).
 */
export function storiesForScope(model: Model, storyId: string, scope: StoryScope): Story[] {
  const story = model.stories.find((s) => s.id === storyId);
  if (!story) return [];
  const above = model.stories.filter((s) => s.height > 0);
  if (scope === "all") return above;
  if (scope === "one") return [story];
  const master = story.similarTo ?? (story.masterStory ? story.id : undefined);
  if (!master) return [story];
  return above.filter((s) => s.id === master || s.similarTo === master);
}

export type Op = { name: string; args: unknown };

/** Lệnh vẽ dầm/giằng nằm ngang trên mặt bằng, lặp theo các tầng. */
export function planLineOps(kind: Frame["kind"], a: P2, b: P2, stories: Story[], section: string): Op[] {
  return stories.map((s) => ({
    name: "frame.add",
    args: { kind, from: [a[0], a[1], s.elevation], to: [b[0], b[1], s.elevation], section, story: s.id },
  }));
}

/** Lệnh vẽ cột tại một điểm mặt bằng: từ tầng dưới lên tầng đang vẽ. */
export function columnOps(model: Model, at: P2, stories: Story[], section: string): Op[] {
  const out: Op[] = [];
  for (const s of stories) {
    const below = storyBelow(model, s.id);
    if (!below) continue;
    out.push({ name: "frame.add", args: { kind: "column", from: [at[0], at[1], below.elevation], to: [at[0], at[1], s.elevation], section, story: s.id } });
  }
  return out;
}

/** Lệnh vẽ sàn theo đa giác mặt bằng. */
export function slabOps(polygon: P2[], stories: Story[], section: string): Op[] {
  return stories.map((s) => ({
    name: "shell.add",
    args: { kind: "slab", points: polygon.map((p) => [p[0], p[1], s.elevation]), section, story: s.id },
  }));
}

/** Lệnh vẽ vách theo đoạn thẳng mặt bằng: từ tầng dưới lên tầng đang vẽ. */
export function wallOps(model: Model, a: P2, b: P2, stories: Story[], section: string): Op[] {
  const out: Op[] = [];
  for (const s of stories) {
    const below = storyBelow(model, s.id);
    if (!below) continue;
    const z0 = below.elevation;
    const z1 = s.elevation;
    out.push({
      name: "shell.add",
      args: { kind: "wall", points: [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], section, story: s.id },
    });
  }
  return out;
}

const SHELL_PREFIX: Record<Shell["kind"], string> = { slab: "F", wall: "W" };
const FRAME_PREFIX: Record<Frame["kind"], string> = { column: "C", beam: "B", brace: "D" };

function polygonArea(pts: P3[]): number {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k]!;
    const b = pts[(k + 1) % pts.length]!;
    nx += a[1] * b[2] - a[2] * b[1];
    ny += a[2] * b[0] - a[0] * b[2];
    nz += a[0] * b[1] - a[1] * b[0];
  }
  return Math.hypot(nx, ny, nz) / 2;
}

function addShell(d: Model, kind: Shell["kind"], points: P3[], section: string, story?: string): string {
  if (points.length < 3) throw new CommandError("Sàn/vách cần ít nhất 3 điểm", "invalid_args");
  if (polygonArea(points) < 1e-6) throw new CommandError("Sàn/vách có diện tích bằng 0", "zero_area");
  requireIn(d, "shellSections", section);
  const joints = points.map((p) => findOrAddJoint(d, p, story));
  if (new Set(joints).size !== joints.length) throw new CommandError("Sàn/vách có hai đỉnh trùng nhau", "invalid_args");
  const key = [...joints].sort().join("|");
  if (d.shells.some((s) => [...s.joints].sort().join("|") === key)) throw new CommandError("Đã có sàn/vách ở vị trí này", "duplicate");
  const label = nextLabel(
    d.shells.map((s) => s.label),
    SHELL_PREFIX[kind],
  );
  const id = `s-${label}-${d.shells.length}`;
  d.shells.push({ id, label, kind, joints, section, ...(story ? { story } : {}) });
  return id;
}

function addFrameRaw(d: Model, f: { kind: Frame["kind"]; i: string; j: string; section: string; story?: string | undefined; releases?: Frame["releases"] }): string | null {
  if (f.i === f.j) return null;
  if (d.frames.some((x) => (x.i === f.i && x.j === f.j) || (x.i === f.j && x.j === f.i))) return null;
  const label = nextLabel(
    d.frames.map((x) => x.label),
    FRAME_PREFIX[f.kind],
  );
  const id = `f-${label}-${d.frames.length}`;
  d.frames.push({ id, label, kind: f.kind, i: f.i, j: f.j, section: f.section, ...(f.story ? { story: f.story } : {}), ...(f.releases ? { releases: f.releases } : {}) });
  return id;
}

const ReplicateMode = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("linear"), dx: z.number(), dy: z.number(), dz: z.number(), count: z.number().int().min(1).max(200) }),
  z.object({ mode: z.literal("mirror"), axis: z.enum(["x", "y"]), value: z.number() }),
  z.object({ mode: z.literal("story"), stories: z.array(z.string()).min(1) }),
]);
export type ReplicateOptions = z.infer<typeof ReplicateMode>;

export const drawingCommands = {
  addJoint: defineCommand({
    name: "joint.add",
    title: "Vẽ nút",
    mutates: true,
    args: z.object({ point: Point, story: z.string().optional() }),
    run(d, a) {
      return findOrAddJoint(d, a.point, a.story);
    },
  }),

  addShell: defineCommand({
    name: "shell.add",
    title: "Vẽ sàn/vách",
    mutates: true,
    args: z.object({ kind: z.enum(["slab", "wall"]), points: z.array(Point).min(3), section: z.string(), story: z.string().optional() }),
    run(d, a) {
      return addShell(d, a.kind, a.points, a.section, a.story);
    },
  }),

  replicate: defineCommand({
    name: "objects.replicate",
    title: "Nhân bản",
    mutates: true,
    args: z.object({ ids: z.array(z.string()).min(1), options: ReplicateMode, copyLoads: z.boolean().default(true) }),
    run(d, a) {
      const ids = new Set(a.ids);
      const joints = new Map(d.joints.map((j) => [j.id, j]));
      const frames = d.frames.filter((f) => ids.has(f.id));
      const shells = d.shells.filter((s) => ids.has(s.id));
      const lone = d.joints.filter((j) => ids.has(j.id));
      if (!frames.length && !shells.length && !lone.length) throw new CommandError("Chưa chọn đối tượng để nhân bản", "invalid_args");

      // Mỗi "bản" là một phép biến đổi điểm + tầng đích.
      type Copy = { move(p: P3): P3; story(src?: string): string | undefined };
      const copies: Copy[] = [];
      const o = a.options;
      if (o.mode === "linear") {
        for (let n = 1; n <= o.count; n++) {
          const dx = o.dx * n;
          const dy = o.dy * n;
          const dz = o.dz * n;
          copies.push({
            move: (p) => [p[0] + dx, p[1] + dy, p[2] + dz],
            story: (src) => {
              if (Math.abs(dz) < TOL) return src;
              const s = d.stories.find((x) => x.id === src);
              return s ? storyAt(d, s.elevation + dz)?.id : undefined;
            },
          });
        }
      } else if (o.mode === "mirror") {
        copies.push({
          move: (p) => (o.axis === "x" ? [2 * o.value - p[0], p[1], p[2]] : [p[0], 2 * o.value - p[1], p[2]]),
          story: (src) => src,
        });
      } else {
        for (const target of o.stories) {
          const t = d.stories.find((s) => s.id === target);
          if (!t) throw new CommandError(`Không có tầng ${target}`, "not_found");
          copies.push({
            move: (p) => p, // dời theo từng đối tượng bên dưới
            story: () => target,
          });
        }
      }

      const created: string[] = [];
      let skipped = 0;
      const pt = (id: string): P3 => {
        const j = joints.get(id)!;
        return [j.x, j.y, j.z];
      };
      copies.forEach((c, ci) => {
        // Với "theo tầng": điểm ở sàn tầng nguồn → sàn tầng đích; điểm ở sàn tầng dưới tầng nguồn →
        // sàn tầng dưới tầng đích (giữ đúng cao độ khi các tầng cao khác nhau); điểm khác dời theo chênh cao độ.
        const place = (p: P3, src?: string): P3 | null => {
          const q = c.move(p);
          if (o.mode !== "story") return q;
          const from = d.stories.find((s) => s.id === src);
          const to = d.stories.find((s) => s.id === o.stories[ci]);
          if (!from || !to) return null;
          const fromBelow = storyBelow(d, from.id);
          const toBelow = storyBelow(d, to.id);
          let z: number;
          if (Math.abs(q[2] - from.elevation) < 1e-4) z = to.elevation;
          else if (fromBelow && Math.abs(q[2] - fromBelow.elevation) < 1e-4) {
            if (!toBelow) return null;
            z = toBelow.elevation;
          } else z = q[2] + (to.elevation - from.elevation);
          return [q[0], q[1], z];
        };
        for (const f of frames) {
          const a1 = place(pt(f.i), f.story);
          const b1 = place(pt(f.j), f.story);
          if (!a1 || !b1 || (o.mode === "story" && f.story === o.stories[ci])) {
            skipped++;
            continue;
          }
          const story = c.story(f.story);
          const id = addFrameRaw(d, { kind: f.kind, i: findOrAddJoint(d, a1, story), j: findOrAddJoint(d, b1, story), section: f.section, story, releases: f.releases });
          if (!id) {
            skipped++;
            continue;
          }
          created.push(id);
          if (a.copyLoads) {
            for (const l of d.frameLoads.filter((x) => x.frame === f.id)) d.frameLoads.push({ ...l, id: `${l.id}-r${created.length}`, frame: id });
          }
        }
        for (const s of shells) {
          const pts = s.joints.map((j) => place(pt(j), s.story));
          if (pts.some((p) => !p) || (o.mode === "story" && s.story === o.stories[ci])) {
            skipped++;
            continue;
          }
          try {
            const id = addShell(d, s.kind, pts as P3[], s.section, c.story(s.story));
            created.push(id);
            if (a.copyLoads) {
              for (const l of d.shellLoads.filter((x) => x.shell === s.id)) d.shellLoads.push({ ...l, id: `${l.id}-r${created.length}`, shell: id });
            }
          } catch (e) {
            if (e instanceof CommandError && e.code === "duplicate") skipped++;
            else throw e;
          }
        }
        for (const j of lone) {
          const p = place([j.x, j.y, j.z], j.story);
          if (!p) continue;
          const id = findOrAddJoint(d, p, c.story(j.story));
          const nj = d.joints.find((x) => x.id === id)!;
          if (j.restraint && !nj.restraint) nj.restraint = [...j.restraint] as typeof j.restraint;
          created.push(id);
        }
      });
      return { created, skipped };
    },
  }),
};
