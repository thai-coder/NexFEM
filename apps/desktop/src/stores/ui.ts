import type { Model, ModelMessage } from "@nexfem/model-core";
import type { HoverInfo, ViewSpec } from "@nexfem/viewer";
import { create } from "zustand";
import { load, save } from "./persist.ts";

export type Theme = "dark" | "light";
export type Layout = 1 | 2 | 4;
export type Tool = "select" | "joint" | "beam" | "column" | "brace" | "slab" | "wall";
export type StoryScope = "one" | "similar" | "all";
export type BottomTab = "console" | "messages" | "tables" | "log";
export type RibbonTab = "modeling" | "loads" | "analysis" | "results" | "design";

export type DialogKind =
  | "about"
  | "shortcuts"
  | "newModel"
  | "gridStory"
  | "materials"
  | "frameSections"
  | "shellSections"
  | "loads"
  | "preferences";

export interface DialogState {
  kind: DialogKind;
  /** Tab mở sẵn (hộp thoại Tải trọng: patterns / cases / combos). */
  tab?: string;
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
  ribbonTab: RibbonTab;
  ribbonCollapsed: boolean;
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

  set(patch: Partial<UiState>): void;
  setTheme(theme: Theme): void;
  setLang(lang: "vi" | "en"): void;
  setLayout(layout: Layout): void;
  setView(pane: number, view: ViewSpec): void;
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
  ribbonTab: "modeling",
  ribbonCollapsed: load("ribbonCollapsed", false),
  tool: "select",
  storyScope: "one",
  paletteOpen: false,
  dialog: null,
  logs: [],
  messages: null,
  cursor: null,
  hover: null,
  zoomSeq: 0,

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
  if (s.ribbonCollapsed !== prev.ribbonCollapsed) save("ribbonCollapsed", s.ribbonCollapsed);
});
