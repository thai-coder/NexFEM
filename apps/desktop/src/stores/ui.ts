import type { Model, ModelMessage } from "@nexfem/model-core";
import { ALL_SNAPS, normalizeDisplay, type DisplayOptions, type HoverInfo, type P3, type SnapModes, type ViewSpec } from "@nexfem/viewer";
import { create } from "zustand";
import { load, save } from "./persist.ts";

export type Theme = "dark" | "light";
export type Layout = 1 | 2 | 4;
export type Tool = "select" | "joint" | "beam" | "column" | "brace" | "slab" | "wall";
export type StoryScope = "one" | "similar" | "all";
export type BottomTab = "console" | "messages" | "tables" | "log";

export type DialogKind =
  | "about"
  | "shortcuts"
  | "newModel"
  | "gridStory"
  | "materials"
  | "frameSections"
  | "shellSections"
  | "loads"
  | "preferences"
  | "replicate"
  | "assignRestraint"
  | "assignSection"
  | "assignReleases"
  | "assignOffsets"
  | "assignDiaphragm"
  | "assignFrameLoad"
  | "assignShellLoad"
  | "rename"
  | "viewOptions"
  | "report"
  | "csiImport";

export interface DialogState {
  kind: DialogKind;
  /** Đối tượng đang xử lý (hộp thoại đổi nhãn). */
  id?: string;
  /** Tab mở sẵn (hộp thoại Tải trọng: patterns / cases / combos). */
  tab?: string;
  /** Ô khung nhìn (hộp thoại tuỳ chọn hiển thị). */
  pane?: number;
  /** Loại báo cáo (hộp thoại báo cáo). */
  report?: string;
}

/** Mục menu ngữ cảnh: lệnh có sẵn, đường phân cách, hoặc mục tuỳ biến. */
export type MenuEntry =
  | string
  | { label: string; icon?: string; disabled?: boolean; header?: boolean; run?(): void };

/** Số ô khung nhìn tối đa (bố cục 4 ô). */
export const MAX_PANES = 4;

/** Tuỳ chọn hiển thị từng ô; dữ liệu cũ (một bộ "display" chung) được dùng cho mọi ô. */
function loadViewDisplay(): DisplayOptions[] {
  const saved = load<Partial<DisplayOptions>[] | null>("viewDisplay", null);
  const legacy = load<Partial<DisplayOptions> | null>("display", null);
  return Array.from({ length: MAX_PANES }, (_, i) => normalizeDisplay(saved?.[i] ?? legacy));
}

export interface LogEntry {
  id: number;
  time: Date;
  level: "info" | "success" | "warning" | "error" | "command";
  text: string;
  /** Nguồn: giao diện, console, API… */
  source?: string;
}

export interface PanelVisibility {
  explorer: boolean;
  properties: boolean;
  bottom: boolean;
}

interface UiState {
  theme: Theme;
  lang: "vi" | "en";
  layout: Layout;
  /** Khung nhìn của 4 ô; bố cục 1/2 ô dùng các ô đầu. */
  views: ViewSpec[];
  activePane: number;
  panels: PanelVisibility;
  bottomTab: BottomTab;
  /** Ẩn thanh công cụ trên và thanh công cụ dọc (Ctrl+F1, chế độ tập trung). */
  toolbarHidden: boolean;
  tool: Tool;
  storyScope: StoryScope;
  paletteOpen: boolean;
  dialog: null | DialogState;
  logs: LogEntry[];
  messages: ModelMessage[] | null;
  cursor: [number, number, number] | null;
  hover: (HoverInfo & { pane: number }) | null;
  /** Tăng mỗi lần yêu cầu "vừa khung" cho ô đang hoạt động. */
  zoomSeq: number;
  /** Chế độ tập trung: ẩn mọi bảng và ribbon; lưu trạng thái cũ để khôi phục. */
  focusMode: boolean;
  focusSaved: { panels: PanelVisibility; toolbarHidden: boolean } | null;
  /** Tuỳ chọn hiển thị riêng của từng ô khung nhìn (Set View Options). */
  viewDisplay: DisplayOptions[];
  /** Loại đối tượng được phép chọn. */
  selectFilter: { joint: boolean; frame: boolean; shell: boolean };
  /** true: lệnh "vừa khung" áp dụng cho mọi ô (mở file, tạo mô hình mới). */
  zoomAll: boolean;
  contextMenu: { x: number; y: number; entries: MenuEntry[] } | null;
  /** Mẫu tải đang hiển thị trên khung nhìn (null = ẩn). */
  loadDisplay: string | null;
  /** Chế độ bắt điểm khi vẽ. */
  snapModes: SnapModes;
  /** Các điểm đã bấm của đối tượng đang vẽ và ô viewport đang vẽ. */
  drawPoints: P3[];
  drawPane: number;
  /** Tiết diện dùng khi vẽ, theo công cụ (rỗng = tự chọn). */
  drawSections: Partial<Record<Exclude<Tool, "select" | "joint">, string>>;

  set(patch: Partial<UiState>): void;
  setTheme(theme: Theme): void;
  setLang(lang: "vi" | "en"): void;
  setLayout(layout: Layout): void;
  setView(pane: number, view: ViewSpec): void;
  /** Đặt tuỳ chọn hiển thị cho một ô, hoặc mọi ô khi `pane` là "all". */
  setViewDisplay(pane: number | "all", display: DisplayOptions): void;
  togglePanel(p: keyof PanelVisibility): void;
  log(level: LogEntry["level"], text: string, source?: string): void;
  clearLog(): void;
}

const defaultViews: ViewSpec[] = [
  { kind: "plan", story: "story-3" },
  { kind: "3d" },
  { kind: "elevation", grid: "grid-main", line: "gx-1" },
  { kind: "elevation", grid: "grid-main", line: "gy-0" },
];

/** Khung nhìn mặc định theo mô hình: mặt bằng tầng giữa, 3D, hai mặt đứng. */
export function defaultViewsFor(model: Model): ViewSpec[] {
  const stories = model.stories.filter((s) => s.height > 0);
  const mid = stories[Math.floor((stories.length - 1) / 2)] ?? model.stories[0];
  const g = model.grids[0];
  const plan: ViewSpec = mid ? { kind: "plan", story: mid.id } : { kind: "3d" };
  const ex: ViewSpec = g?.x[Math.min(1, g.x.length - 1)] ? { kind: "elevation", grid: g.id, line: g.x[Math.min(1, g.x.length - 1)]!.id } : { kind: "3d" };
  const ey: ViewSpec = g?.y[0] ? { kind: "elevation", grid: g.id, line: g.y[0].id } : { kind: "3d" };
  return [plan, { kind: "3d" }, ex, ey];
}

let logId = 0;

export const useUi = create<UiState>((set, get) => ({
  theme: load<Theme>("theme", "dark"),
  lang: load<"vi" | "en">("lang", "vi"),
  layout: load<Layout>("layout", 2),
  views: defaultViews,
  activePane: 0,
  panels: load<PanelVisibility>("panels", { explorer: true, properties: true, bottom: true }),
  bottomTab: "console",
  toolbarHidden: false,
  tool: "select",
  storyScope: "one",
  paletteOpen: false,
  dialog: null,
  logs: [],
  messages: null,
  cursor: null,
  hover: null,
  zoomSeq: 0,
  snapModes: load<SnapModes>("snapModes", ALL_SNAPS),
  loadDisplay: null,
  focusMode: false,
  focusSaved: null,
  viewDisplay: loadViewDisplay(),
  selectFilter: load("selectFilter", { joint: true, frame: true, shell: true }),
  zoomAll: false,
  contextMenu: null,
  drawPoints: [],
  drawPane: 0,
  drawSections: {},

  set: (patch) => set(patch),
  setTheme: (theme) => {
    save("theme", theme);
    set({ theme });
  },
  setLang: (lang) => {
    save("lang", lang);
    set({ lang });
  },
  setLayout: (layout) => {
    save("layout", layout);
    set({ layout, activePane: Math.min(get().activePane, layout - 1) });
  },
  setView: (pane, view) => set({ views: get().views.map((v, i) => (i === pane ? view : v)) }),
  setViewDisplay: (pane, display) =>
    set({ viewDisplay: get().viewDisplay.map((d, i) => (pane === "all" || i === pane ? { ...display } : d)) }),
  togglePanel: (p) => {
    const panels = { ...get().panels, [p]: !get().panels[p] };
    save("panels", panels);
    set({ panels });
  },
  log: (level, text, source) =>
    set({ logs: [...get().logs.slice(-499), { id: ++logId, time: new Date(), level, text, ...(source ? { source } : {}) }] }),
  clearLog: () => set({ logs: [] }),
}));

useUi.subscribe((s, prev) => {
  if (s.viewDisplay !== prev.viewDisplay) save("viewDisplay", s.viewDisplay);
  if (s.selectFilter !== prev.selectFilter) save("selectFilter", s.selectFilter);
  if (s.snapModes !== prev.snapModes) save("snapModes", s.snapModes);
});
