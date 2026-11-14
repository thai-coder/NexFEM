import { z } from "zod";

/** Phiên bản schema của file mô hình. Tăng khi thay đổi không tương thích ngược. */
export const MODEL_SCHEMA_VERSION = 1;

const Id = z.string().min(1);
const Num = z.number().finite();

export const UnitSystemSchema = z.object({
  force: z.enum(["N", "kN", "kgf", "tonf"]),
  length: z.enum(["mm", "cm", "m"]),
  temperature: z.enum(["C", "F"]),
});

export const GridLineSchema = z.object({
  id: Id,
  label: z.string(),
  /** Toạ độ theo phương của trục (m). */
  coord: Num,
});

export const GridSystemSchema = z.object({
  id: Id,
  name: z.string(),
  x: z.array(GridLineSchema),
  y: z.array(GridLineSchema),
});

export const StorySchema = z.object({
  id: Id,
  name: z.string(),
  /** Cao độ sàn tầng (m). */
  elevation: Num,
  /** Chiều cao tầng tính từ tầng dưới (m). */
  height: Num.nonnegative(),
  masterStory: z.boolean().default(false),
  similarTo: Id.optional(),
});

export const MaterialSchema = z.object({
  id: Id,
  name: z.string(),
  type: z.enum(["concrete", "steel", "rebar", "other"]),
  /** Mô đun đàn hồi (kN/m²). */
  E: Num.positive(),
  /** Hệ số Poisson. */
  nu: Num.min(0).max(0.5),
  /** Trọng lượng riêng (kN/m³). */
  gamma: Num.nonnegative(),
  /** Cường độ đặc trưng: bê tông fck hoặc Rb, thép fy (kN/m²). */
  strength: Num.nonnegative().optional(),
  code: z.string().optional(),
});

export const FrameShapeSchema = z.discriminatedUnion("shape", [
  z.object({ shape: z.literal("rect"), b: Num.positive(), h: Num.positive() }),
  z.object({ shape: z.literal("circle"), d: Num.positive() }),
  z.object({
    shape: z.literal("I"),
    h: Num.positive(),
    bf: Num.positive(),
    tf: Num.positive(),
    tw: Num.positive(),
    /** Bán kính lượn chân (thép cán), m. Bỏ trống hoặc 0: tiết diện tổ hợp hàn không có góc lượn. */
    r: Num.nonnegative().optional(),
  }),
  z.object({ shape: z.literal("box"), h: Num.positive(), b: Num.positive(), t: Num.positive() }),
  z.object({ shape: z.literal("pipe"), d: Num.positive(), t: Num.positive() }),
]);

export const FrameSectionSchema = z.object({
  id: Id,
  name: z.string(),
  material: Id,
  geometry: FrameShapeSchema,
  /** Diện tích chịu cắt hữu hiệu dọc trục cục bộ 2/3 (m²); bỏ trống → Euler–Bernoulli. */
  shearAreas: z.object({ a2: Num.positive(), a3: Num.positive() }).optional(),
});

export const ShellSectionSchema = z.object({
  id: Id,
  name: z.string(),
  material: Id,
  kind: z.enum(["slab", "wall"]),
  formulation: z.enum(["shell-thin", "shell-thick", "membrane", "plate"]),
  thickness: Num.positive(),
});

/** Bậc tự do bị giữ: [Ux, Uy, Uz, Rx, Ry, Rz]. */
export const RestraintSchema = z.tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean(), z.boolean(), z.boolean()]);

export const JointSchema = z.object({
  id: Id,
  label: z.string(),
  x: Num,
  y: Num,
  z: Num,
  story: Id.optional(),
  restraint: RestraintSchema.optional(),
});

export const FrameSchema = z.object({
  id: Id,
  label: z.string(),
  kind: z.enum(["beam", "column", "brace"]),
  i: Id,
  j: Id,
  section: Id,
  story: Id.optional(),
  /** Nhả liên kết đầu i / j: [P, V2, V3, T, M2, M3]. */
  releases: z
    .object({ i: z.array(z.boolean()).length(6), j: z.array(z.boolean()).length(6) })
    .optional(),
  /** Vùng cứng đầu thanh dọc trục i/j, đo từ tim nút (m). */
  offsets: z.object({ i: Num.min(0), j: Num.min(0) }).optional(),
});

export const ShellSchema = z.object({
  id: Id,
  label: z.string(),
  kind: z.enum(["slab", "wall"]),
  joints: z.array(Id).min(3),
  section: Id,
  story: Id.optional(),
});

export const LoadPatternSchema = z.object({
  id: Id,
  name: z.string(),
  type: z.enum(["dead", "superDead", "live", "wind", "seismic", "other"]),
  selfWeight: Num.nonnegative().default(0),
});

export const LoadCaseSchema = z.object({
  id: Id,
  name: z.string(),
  type: z.enum(["linearStatic", "modal", "responseSpectrum"]),
  loads: z.array(z.object({ pattern: Id, factor: Num })).default([]),
});

export const LoadComboSchema = z.object({
  id: Id,
  name: z.string(),
  type: z.enum(["linearAdd", "envelope", "srss", "absAdd"]),
  items: z.array(z.object({ case: Id, factor: Num })),
});

export const FrameLoadSchema = z.object({
  id: Id,
  frame: Id,
  pattern: Id,
  kind: z.enum(["distributed", "point"]),
  direction: z.enum(["gravity", "localX", "local2", "local3", "globalX", "globalY", "globalZ"]),
  /** Giá trị tải (kN/m với phân bố, kN với tập trung). */
  value: Num,
  /** Vị trí tương đối 0..1 cho tải tập trung. */
  at: Num.min(0).max(1).optional(),
});

export const ShellLoadSchema = z.object({
  id: Id,
  shell: Id,
  pattern: Id,
  direction: z.enum(["gravity", "globalZ", "local3"]),
  /** kN/m². */
  value: Num,
});

/** Rigid diaphragm mặt phẳng ngang: master và danh sách slave; không tạo độ cứng shell. */
export const DiaphragmSchema = z.object({
  id: Id,
  name: z.string(),
  master: Id,
  slaves: z.array(Id).min(1),
});

export const ModelSchema = z.object({
  schemaVersion: z.literal(MODEL_SCHEMA_VERSION),
  name: z.string(),
  units: UnitSystemSchema,
  designCodes: z
    .object({ concrete: z.string().optional(), steel: z.string().optional(), loads: z.string().optional() })
    .default({}),
  grids: z.array(GridSystemSchema),
  stories: z.array(StorySchema),
  materials: z.array(MaterialSchema),
  frameSections: z.array(FrameSectionSchema),
  shellSections: z.array(ShellSectionSchema),
  joints: z.array(JointSchema),
  diaphragms: z.array(DiaphragmSchema).optional(),
  frames: z.array(FrameSchema),
  shells: z.array(ShellSchema),
  loadPatterns: z.array(LoadPatternSchema),
  loadCases: z.array(LoadCaseSchema),
  combos: z.array(LoadComboSchema),
  frameLoads: z.array(FrameLoadSchema).default([]),
  shellLoads: z.array(ShellLoadSchema).default([]),
});

export type UnitSystem = z.infer<typeof UnitSystemSchema>;
export type GridLine = z.infer<typeof GridLineSchema>;
export type GridSystem = z.infer<typeof GridSystemSchema>;
export type Story = z.infer<typeof StorySchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type FrameShape = z.infer<typeof FrameShapeSchema>;
export type FrameSection = z.infer<typeof FrameSectionSchema>;
export type ShellSection = z.infer<typeof ShellSectionSchema>;
export type Restraint = z.infer<typeof RestraintSchema>;
export type Joint = z.infer<typeof JointSchema>;
export type Diaphragm = z.infer<typeof DiaphragmSchema>;
export type Frame = z.infer<typeof FrameSchema>;
export type Shell = z.infer<typeof ShellSchema>;
export type LoadPattern = z.infer<typeof LoadPatternSchema>;
export type LoadCase = z.infer<typeof LoadCaseSchema>;
export type LoadCombo = z.infer<typeof LoadComboSchema>;
export type FrameLoad = z.infer<typeof FrameLoadSchema>;
export type ShellLoad = z.infer<typeof ShellLoadSchema>;
export type Model = z.infer<typeof ModelSchema>;

/** Các bộ sưu tập đối tượng trong mô hình, dùng chung cho cây mô hình, API và bảng. */
export const COLLECTIONS = [
  "grids",
  "stories",
  "materials",
  "frameSections",
  "shellSections",
  "joints",
  "frames",
  "shells",
  "loadPatterns",
  "loadCases",
  "combos",
  "frameLoads",
  "shellLoads",
] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

/** Kiểm tra và chuẩn hoá dữ liệu mô hình đọc từ file hoặc API. */
export function parseModel(data: unknown): Model {
  return ModelSchema.parse(data);
}

export function emptyModel(name = "Mô hình mới", units: UnitSystem = { force: "kN", length: "m", temperature: "C" }): Model {
  return {
    schemaVersion: MODEL_SCHEMA_VERSION,
    name,
    units,
    designCodes: {},
    grids: [],
    stories: [],
    materials: [],
    frameSections: [],
    shellSections: [],
    joints: [],
    frames: [],
    shells: [],
    loadPatterns: [],
    loadCases: [],
    combos: [],
    frameLoads: [],
    shellLoads: [],
  };
}
