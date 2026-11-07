import { MATERIAL_LIBRARY } from "./library.ts";
import { emptyModel, type Frame, type Joint, type Model, type Shell } from "./schema.ts";

export interface RcFrameOptions {
  name?: string;
  /** Các nhịp theo phương X (m). */
  xSpans: number[];
  /** Các nhịp theo phương Y (m). */
  ySpans: number[];
  /** Chiều cao các tầng từ dưới lên (m). */
  storyHeights: number[];
  column?: { b: number; h: number };
  beam?: { b: number; h: number };
  slabThickness?: number;
  /** Mác bê tông trong thư viện, mặc định B25. */
  concrete?: string;
  /** Có tạo sàn không (mặc định có). */
  slabs?: boolean;
  /** "frame": dựng cột, dầm, sàn; "grid": chỉ lưới trục, tầng và định nghĩa. */
  objects?: "frame" | "grid";
  units?: Model["units"];
}

const X_LABELS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function material(name: string) {
  const m = MATERIAL_LIBRARY.find((x) => x.name === name);
  if (!m) throw new Error(`Không có vật liệu ${name} trong thư viện`);
  return structuredClone(m);
}

const mm = (v: number) => Math.round(v * 1000);

/**
 * Tạo mô hình khung BTCT theo lưới trục đều: cột tại mọi giao điểm, dầm theo hai phương, sàn mỗi ô.
 * Chân cột ngàm. Dùng làm mẫu "New model" và dữ liệu kiểm thử.
 */
export function createRcFrameModel(opts: RcFrameOptions): Model {
  const model = emptyModel(opts.name ?? "Khung BTCT", opts.units);
  model.designCodes = { concrete: "TCVN 5574:2018", loads: "TCVN 2737:2023" };
  const col = opts.column ?? { b: 0.4, h: 0.4 };
  const beam = opts.beam ?? { b: 0.3, h: 0.6 };
  const slabT = opts.slabThickness ?? 0.12;

  const xs = [0];
  for (const s of opts.xSpans) xs.push(xs[xs.length - 1]! + s);
  const ys = [0];
  for (const s of opts.ySpans) ys.push(ys[ys.length - 1]! + s);

  model.grids.push({
    id: "grid-main",
    name: "Lưới chính",
    x: xs.map((c, i) => ({ id: `gx-${i}`, label: X_LABELS[i] ?? `X${i + 1}`, coord: c })),
    y: ys.map((c, i) => ({ id: `gy-${i}`, label: String(i + 1), coord: c })),
  });

  model.stories.push({ id: "story-0", name: "Base", elevation: 0, height: 0, masterStory: false });
  let z = 0;
  opts.storyHeights.forEach((h, k) => {
    z += h;
    model.stories.push({
      id: `story-${k + 1}`,
      name: `Tầng ${k + 1}`,
      elevation: Math.round(z * 1e6) / 1e6,
      height: h,
      masterStory: k === 0,
      ...(k > 0 ? { similarTo: "story-1" } : {}),
    });
  });

  const conc = material(opts.concrete ?? "B25");
  const reb = material("CB400-V");
  model.materials.push(conc, reb);

  const colName = `C${mm(col.b)}x${mm(col.h)}`;
  const beamName = `D${mm(beam.b)}x${mm(beam.h)}`;
  model.frameSections.push(
    { id: "sec-col", name: colName, material: conc.id, geometry: { shape: "rect", b: col.b, h: col.h } },
    { id: "sec-beam", name: beamName, material: conc.id, geometry: { shape: "rect", b: beam.b, h: beam.h } },
  );
  model.shellSections.push({
    id: "sec-slab",
    name: `S${mm(slabT)}`,
    material: conc.id,
    kind: "slab",
    formulation: "shell-thin",
    thickness: slabT,
  });

  const jointId = (ix: number, iy: number, k: number) => `j-${ix}-${iy}-${k}`;
  let jn = 0;
  model.stories.forEach((story, k) => {
    ys.forEach((y, iy) => {
      xs.forEach((x, ix) => {
        const joint: Joint = { id: jointId(ix, iy, k), label: String(++jn), x, y, z: story.elevation, story: story.id };
        if (k === 0) joint.restraint = [true, true, true, true, true, true];
        model.joints.push(joint);
      });
    });
  });

  let cn = 0;
  let bn = 0;
  let fn = 0;
  const frames: Frame[] = [];
  const shells: Shell[] = [];
  for (let k = 1; k < model.stories.length; k++) {
    const story = model.stories[k]!;
    for (let iy = 0; iy < ys.length; iy++) {
      for (let ix = 0; ix < xs.length; ix++) {
        frames.push({
          id: `c-${ix}-${iy}-${k}`,
          label: `C${++cn}`,
          kind: "column",
          i: jointId(ix, iy, k - 1),
          j: jointId(ix, iy, k),
          section: "sec-col",
          story: story.id,
        });
      }
    }
    for (let iy = 0; iy < ys.length; iy++) {
      for (let ix = 0; ix + 1 < xs.length; ix++) {
        frames.push({
          id: `bx-${ix}-${iy}-${k}`,
          label: `B${++bn}`,
          kind: "beam",
          i: jointId(ix, iy, k),
          j: jointId(ix + 1, iy, k),
          section: "sec-beam",
          story: story.id,
        });
      }
    }
    for (let ix = 0; ix < xs.length; ix++) {
      for (let iy = 0; iy + 1 < ys.length; iy++) {
        frames.push({
          id: `by-${ix}-${iy}-${k}`,
          label: `B${++bn}`,
          kind: "beam",
          i: jointId(ix, iy, k),
          j: jointId(ix, iy + 1, k),
          section: "sec-beam",
          story: story.id,
        });
      }
    }
    for (let iy = 0; iy + 1 < ys.length; iy++) {
      for (let ix = 0; ix + 1 < xs.length; ix++) {
        shells.push({
          id: `s-${ix}-${iy}-${k}`,
          label: `F${++fn}`,
          kind: "slab",
          joints: [jointId(ix, iy, k), jointId(ix + 1, iy, k), jointId(ix + 1, iy + 1, k), jointId(ix, iy + 1, k)],
          section: "sec-slab",
          story: story.id,
        });
      }
    }
  }
  model.frames = frames;
  model.shells = opts.slabs === false ? [] : shells;

  model.loadPatterns.push(
    { id: "lp-dl", name: "DL", type: "dead", selfWeight: 1 },
    { id: "lp-sdl", name: "SDL", type: "superDead", selfWeight: 0 },
    { id: "lp-ll", name: "LL", type: "live", selfWeight: 0 },
  );
  model.loadCases.push(
    { id: "lc-dl", name: "DL", type: "linearStatic", loads: [{ pattern: "lp-dl", factor: 1 }] },
    { id: "lc-sdl", name: "SDL", type: "linearStatic", loads: [{ pattern: "lp-sdl", factor: 1 }] },
    { id: "lc-ll", name: "LL", type: "linearStatic", loads: [{ pattern: "lp-ll", factor: 1 }] },
    { id: "lc-modal", name: "Modal", type: "modal", loads: [] },
  );
  // Tổ hợp mẫu với hệ số 1.0; tổ hợp theo tiêu chuẩn sẽ được sinh tự động ở giai đoạn thiết kế.
  model.combos.push({
    id: "co-service",
    name: "SERVICE",
    type: "linearAdd",
    items: [
      { case: "lc-dl", factor: 1 },
      { case: "lc-sdl", factor: 1 },
      { case: "lc-ll", factor: 1 },
    ],
  });
  for (const s of model.shells) {
    model.shellLoads.push({ id: `sl-sdl-${s.id}`, shell: s.id, pattern: "lp-sdl", direction: "gravity", value: 1.5 });
    model.shellLoads.push({ id: `sl-ll-${s.id}`, shell: s.id, pattern: "lp-ll", direction: "gravity", value: 2.0 });
  }
  if (opts.objects === "grid") {
    model.joints = [];
    model.frames = [];
    model.shells = [];
    model.shellLoads = [];
  }
  return model;
}

/** Mô hình mẫu dùng khi mở app lần đầu và trong kiểm thử. */
export function sampleModel(): Model {
  return createRcFrameModel({
    name: "Toa_nha_A",
    xSpans: [6, 6, 6],
    ySpans: [7.2, 7.2],
    storyHeights: [3.9, 3.6, 3.6, 3.6, 3.6],
  });
}
