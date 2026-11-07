import { checkModel } from "@nexfem/model-core";
import type { ViewSpec } from "@nexfem/viewer";
import { t } from "../i18n/index.ts";
import type { Strings } from "../i18n/vi.ts";
import { useModel } from "../stores/model.ts";
import { openProject, saveProject } from "../services/files.ts";
import { cancel as cancelDraw, finish as finishDraw, undoPoint } from "../tools/draw.ts";
import { useUi, type DialogKind, type Tool } from "../stores/ui.ts";

export type CommandId = keyof Strings["cmd"];

export interface AppCommand {
  id: CommandId;
  icon?: string;
  /** Phím tắt hiển thị, ví dụ "Ctrl+Z". */
  shortcut?: string;
  /** Các tổ hợp phím kích hoạt, dạng chuẩn hoá "ctrl+shift+p", "f5", "b". */
  keys?: string[];
  run(): void;
  enabled?(): boolean;
  checked?(): boolean;
  /** Tính năng chưa làm: giai đoạn dự kiến trong ROADMAP. */
  phase?: number;
}

const ui = () => useUi.getState();
const model = () => useModel.getState();

function notYet(id: CommandId, phase: number) {
  ui().log("info", t().fmt(t().log.phase, { feature: t().cmd[id].replace(/…$/, ""), phase }));
}

/** Tầng đang làm việc: tầng của ô Plan đang hoạt động, nếu không thì tầng trên cùng. */
export function currentStory(): string | undefined {
  const s = ui();
  const v = s.views[s.activePane];
  if (v?.kind === "plan") return v.story;
  const plan = s.views.find((x) => x.kind === "plan");
  if (plan?.kind === "plan") return plan.story;
  return model().model.stories.at(-1)?.id;
}

function dialog(kind: DialogKind, tab?: string) {
  ui().set({ dialog: tab ? { kind, tab } : { kind }, paletteOpen: false });
}

const unlocked = () => !model().locked;

function setActiveView(view: ViewSpec) {
  ui().setView(ui().activePane, view);
}

function moveStory(delta: number) {
  const m = model().model;
  const stories = m.stories.filter((s) => s.height > 0 || m.stories.length === 1);
  const cur = currentStory();
  const idx = Math.max(0, stories.findIndex((s) => s.id === cur));
  const next = stories[Math.min(stories.length - 1, Math.max(0, idx + delta))];
  if (!next) return;
  const s = ui();
  const pane = s.views[s.activePane]?.kind === "plan" ? s.activePane : s.views.findIndex((v) => v.kind === "plan");
  s.setView(pane >= 0 ? pane : s.activePane, { kind: "plan", story: next.id });
}

function setTool(tool: Tool) {
  ui().set({ tool, drawPoints: [] });
  // Khung đang hoạt động là 3D thì chuyển sang mặt bằng để vẽ được ngay.
  const s = ui();
  if (tool !== "select" && s.views[s.activePane]?.kind === "3d") {
    const plan = s.views.findIndex((v) => v.kind !== "3d");
    if (plan >= 0 && plan < s.layout) s.set({ activePane: plan });
    else s.setView(s.activePane, { kind: "plan", story: currentStory() ?? "" });
  }
}

export function runCheck(): number {
  const msgs = checkModel(model().model);
  const count = (l: string) => msgs.filter((m) => m.level === l).length;
  ui().set({ messages: msgs });
  ui().log(
    count("error") ? "warning" : "success",
    t().fmt(t().log.checkDone, { errors: count("error"), warnings: count("warning"), infos: count("info") }),
    "analysis",
  );
  return count("error");
}

const draw = (tool: Tool, icon: string, key?: string): AppCommand => ({
  id: `draw.${tool}` as CommandId,
  icon,
  ...(key ? { shortcut: key.toUpperCase(), keys: [key] } : {}),
  run: () => setTool(tool),
  checked: () => ui().tool === tool,
  enabled: () => !model().locked || tool === "select",
});

const later = (id: CommandId, phase: number, icon?: string, shortcut?: string, keys?: string[]): AppCommand => ({
  id,
  phase,
  ...(icon ? { icon } : {}),
  ...(shortcut ? { shortcut } : {}),
  ...(keys ? { keys } : {}),
  run: () => notYet(id, phase),
});

export const COMMANDS: AppCommand[] = [
  { id: "file.new", icon: "new", shortcut: "Ctrl+N", keys: ["ctrl+n"], run: () => dialog("newModel") },
  { id: "file.open", icon: "open", shortcut: "Ctrl+O", keys: ["ctrl+o"], run: () => void openProject() },
  { id: "file.save", icon: "save", shortcut: "Ctrl+S", keys: ["ctrl+s"], run: () => void saveProject(false) },
  { id: "file.saveAs", shortcut: "Ctrl+Shift+S", keys: ["ctrl+shift+s"], run: () => void saveProject(true) },
  later("file.import", 8),
  later("file.export", 6),

  {
    id: "edit.undo",
    icon: "undo",
    shortcut: "Ctrl+Z",
    keys: ["ctrl+z"],
    run: () => model().undo(),
    enabled: () => model().canUndo && !model().locked,
  },
  {
    id: "edit.redo",
    icon: "redo",
    shortcut: "Ctrl+Y",
    keys: ["ctrl+y", "ctrl+shift+z"],
    run: () => model().redo(),
    enabled: () => model().canRedo && !model().locked,
  },
  {
    id: "edit.delete",
    shortcut: "Del",
    keys: ["delete"],
    run: () => {
      const ids = model().selection;
      if (ids.length) model().execute("objects.delete", { ids });
    },
    enabled: () => model().selection.length > 0 && !model().locked,
  },
  {
    id: "edit.replicate",
    shortcut: "Ctrl+R",
    keys: ["ctrl+r"],
    run: () => dialog("replicate"),
    enabled: () => model().selection.length > 0 && !model().locked,
  },
  {
    id: "edit.selectAll",
    shortcut: "Ctrl+A",
    keys: ["ctrl+a"],
    run: () => {
      const m = model().model;
      model().select([...m.frames, ...m.shells].map((o) => o.id));
    },
  },

  {
    id: "view.plan",
    icon: "plan",
    run: () => setActiveView({ kind: "plan", story: currentStory() ?? "" }),
    checked: () => ui().views[ui().activePane]?.kind === "plan",
  },
  {
    id: "view.elevation",
    icon: "elevation",
    run: () => {
      const g = model().model.grids[0];
      if (g?.x[0]) setActiveView({ kind: "elevation", grid: g.id, line: g.x[0].id });
    },
    checked: () => ui().views[ui().activePane]?.kind === "elevation",
  },
  {
    id: "view.3d",
    icon: "view3d",
    run: () => setActiveView({ kind: "3d" }),
    checked: () => ui().views[ui().activePane]?.kind === "3d",
  },
  { id: "view.layout1", icon: "layout1", shortcut: "Ctrl+1", keys: ["ctrl+1"], run: () => ui().setLayout(1), checked: () => ui().layout === 1 },
  { id: "view.layout2", icon: "layout2", shortcut: "Ctrl+2", keys: ["ctrl+2"], run: () => ui().setLayout(2), checked: () => ui().layout === 2 },
  { id: "view.layout4", icon: "layout4", shortcut: "Ctrl+4", keys: ["ctrl+4"], run: () => ui().setLayout(4), checked: () => ui().layout === 4 },
  {
    id: "view.zoomExtents",
    icon: "zoomExtents",
    shortcut: "Ctrl+Shift+E",
    keys: ["ctrl+shift+e"],
    run: () => ui().set({ zoomSeq: ui().zoomSeq + 1 }),
  },
  { id: "view.toggleExplorer", shortcut: "F2", keys: ["f2"], run: () => ui().togglePanel("explorer"), checked: () => ui().panels.explorer },
  { id: "view.toggleProperties", shortcut: "F4", keys: ["f4"], run: () => ui().togglePanel("properties"), checked: () => ui().panels.properties },
  { id: "view.toggleBottom", shortcut: "F8", keys: ["f8"], run: () => ui().togglePanel("bottom"), checked: () => ui().panels.bottom },
  { id: "view.storyUp", icon: "up", shortcut: "PgUp", keys: ["pageup"], run: () => moveStory(1) },
  { id: "view.storyDown", icon: "down", shortcut: "PgDn", keys: ["pagedown"], run: () => moveStory(-1) },
  {
    id: "view.resetLayout",
    run: () => window.dispatchEvent(new CustomEvent("nexfem:reset-layout")),
  },

  { id: "define.grids", icon: "grid", run: () => dialog("gridStory"), enabled: unlocked },
  { id: "define.stories", icon: "story", run: () => dialog("gridStory"), enabled: unlocked },
  { id: "define.materials", icon: "material", run: () => dialog("materials"), enabled: unlocked },
  { id: "define.frameSections", icon: "section", run: () => dialog("frameSections"), enabled: unlocked },
  { id: "define.shellSections", icon: "slab", run: () => dialog("shellSections"), enabled: unlocked },
  { id: "define.loadPatterns", icon: "load", run: () => dialog("loads", "loadPatterns"), enabled: unlocked },
  { id: "define.loadCases", icon: "load", run: () => dialog("loads", "loadCases"), enabled: unlocked },
  { id: "define.combos", icon: "combo", run: () => dialog("loads", "combos"), enabled: unlocked },

  { ...draw("select", "select"), shortcut: "Esc", keys: ["escape"], run: () => cancelDraw() },
  { id: "draw.finish", shortcut: "Enter", keys: ["enter"], run: () => finishDraw(), enabled: () => ui().drawPoints.length > 0 },
  { id: "draw.undoPoint", shortcut: "Backspace", keys: ["backspace"], run: () => undoPoint(), enabled: () => ui().drawPoints.length > 0 },
  draw("joint", "joint", "j"),
  draw("beam", "beam", "b"),
  draw("column", "column", "c"),
  draw("brace", "brace", "r"),
  draw("slab", "slab", "s"),
  draw("wall", "wall", "w"),

  { id: "select.clear", run: () => model().select([]), enabled: () => model().selection.length > 0 },
  {
    id: "select.invert",
    run: () => {
      const m = model().model;
      const cur = new Set(model().selection);
      model().select([...m.frames, ...m.shells].map((o) => o.id).filter((id) => !cur.has(id)));
    },
  },
  {
    id: "select.byStory",
    run: () => {
      const story = currentStory();
      const m = model().model;
      model().select([...m.frames, ...m.shells].filter((o) => o.story === story).map((o) => o.id));
    },
  },

  { id: "assign.restraint", icon: "joint", run: () => dialog("assignRestraint"), enabled: unlocked },
  { id: "assign.section", icon: "section", run: () => dialog("assignSection"), enabled: unlocked },
  { id: "assign.releases", icon: "beam", run: () => dialog("assignReleases"), enabled: unlocked },
  { id: "assign.frameLoad", icon: "load", run: () => dialog("assignFrameLoad"), enabled: unlocked },
  { id: "assign.shellLoad", icon: "slab", run: () => dialog("assignShellLoad"), enabled: unlocked },

  {
    id: "analyze.check",
    icon: "check",
    run: () => {
      runCheck();
      ui().set({ bottomTab: "messages", panels: { ...ui().panels, bottom: true } });
    },
  },
  {
    id: "analyze.run",
    icon: "run",
    shortcut: "F5",
    keys: ["f5"],
    run: () => {
      const errors = runCheck();
      const s = ui();
      s.set({ panels: { ...s.panels, bottom: true } });
      if (errors) {
        s.log("error", t().fmt(t().log.runBlocked, { n: errors }), "analysis");
        s.set({ bottomTab: "messages" });
        return;
      }
      const m = model().model;
      const dof = m.joints.reduce((n, j) => n + (j.restraint ? j.restraint.filter((x) => !x).length : 6), 0);
      s.log("info", t().fmt(t().log.runNoSolver, { dof }), "analysis");
      s.set({ bottomTab: "log" });
    },
  },
  {
    id: "analyze.unlock",
    icon: "unlock",
    shortcut: "F6",
    keys: ["f6"],
    run: () => useModel.setState({ locked: false }),
    enabled: () => model().locked,
  },

  later("display.deformed", 6, "deformed"),
  later("display.moment", 6, "moment"),
  later("display.shear", 6, "shear"),
  later("display.axial", 6, "axial"),
  later("design.concrete", 10),
  later("design.steel", 10),

  { id: "tools.palette", icon: "search", shortcut: "Ctrl+Shift+P", keys: ["ctrl+shift+p"], run: () => ui().set({ paletteOpen: true }) },
  {
    id: "tools.theme",
    run: () => ui().setTheme(ui().theme === "dark" ? "light" : "dark"),
  },
  { id: "tools.language", icon: "language", run: () => ui().setLang(ui().lang === "vi" ? "en" : "vi") },
  { id: "tools.preferences", run: () => dialog("preferences") },
  { id: "help.shortcuts", icon: "keyboard", shortcut: "F1", keys: ["f1"], run: () => ui().set({ dialog: { kind: "shortcuts" } }) },
  { id: "help.about", icon: "info", run: () => ui().set({ dialog: { kind: "about" } }) },
];

const byId = new Map(COMMANDS.map((c) => [c.id, c]));

export function command(id: CommandId): AppCommand {
  const c = byId.get(id);
  if (!c) throw new Error(`Thiếu lệnh ${id}`);
  return c;
}

export function runCommand(id: CommandId): void {
  const c = command(id);
  if (c.enabled && !c.enabled()) return;
  c.run();
}

export type MenuItem = CommandId | "-";

export const MENUS: { id: keyof Strings["menu"]; items: MenuItem[] }[] = [
  { id: "file", items: ["file.new", "file.open", "file.save", "file.saveAs", "-", "file.import", "file.export"] },
  { id: "edit", items: ["edit.undo", "edit.redo", "-", "edit.delete", "edit.replicate", "-", "edit.selectAll"] },
  {
    id: "view",
    items: [
      "view.plan",
      "view.elevation",
      "view.3d",
      "-",
      "view.layout1",
      "view.layout2",
      "view.layout4",
      "view.zoomExtents",
      "-",
      "view.storyUp",
      "view.storyDown",
      "-",
      "view.toggleExplorer",
      "view.toggleProperties",
      "view.toggleBottom",
      "view.resetLayout",
    ],
  },
  {
    id: "define",
    items: [
      "define.grids",
      "define.stories",
      "-",
      "define.materials",
      "define.frameSections",
      "define.shellSections",
      "-",
      "define.loadPatterns",
      "define.loadCases",
      "define.combos",
    ],
  },
  { id: "draw", items: ["draw.select", "-", "draw.joint", "draw.beam", "draw.column", "draw.brace", "draw.slab", "draw.wall", "-", "draw.finish", "draw.undoPoint"] },
  { id: "select", items: ["edit.selectAll", "select.byStory", "select.invert", "select.clear"] },
  { id: "assign", items: ["assign.restraint", "-", "assign.section", "assign.releases", "-", "assign.frameLoad", "assign.shellLoad"] },
  { id: "analyze", items: ["analyze.check", "analyze.run", "analyze.unlock"] },
  { id: "display", items: ["display.deformed", "display.moment", "display.shear", "display.axial"] },
  { id: "design", items: ["design.concrete", "design.steel"] },
  { id: "tools", items: ["tools.palette", "-", "tools.theme", "tools.language", "tools.preferences"] },
  { id: "help", items: ["help.shortcuts", "help.about"] },
];

/** Chuẩn hoá sự kiện bàn phím thành chuỗi như "ctrl+shift+p". */
export function keyOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  let k = e.key.toLowerCase();
  if (k === "del") k = "delete";
  if (k === "esc") k = "escape";
  if (/^digit\d$/.test(e.code.toLowerCase()) && (e.ctrlKey || e.metaKey)) k = e.code.slice(5);
  parts.push(k);
  return parts.join("+");
}

const keyMap = new Map<string, AppCommand>();
for (const c of COMMANDS) for (const k of c.keys ?? []) keyMap.set(k, c);

/** Xử lý phím tắt toàn cục. Trả về true nếu đã xử lý. */
export function handleShortcut(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
  const key = keyOf(e);
  const c = keyMap.get(key);
  if (!c) return false;
  // Phím một chữ cái và Delete không chạy khi đang gõ.
  const plain = !key.includes("+") && (key.length === 1 || key === "delete" || key === "enter" || key === "backspace");
  if (typing && (plain || key === "ctrl+a" || key === "ctrl+z" || key === "ctrl+y")) return false;
  if (typing && key === "escape") return false;
  // Enter/Backspace chỉ có tác dụng khi đang vẽ; nếu không thì để trình duyệt xử lý bình thường.
  if ((key === "enter" || key === "backspace") && c.enabled && !c.enabled()) return false;
  e.preventDefault();
  if (c.enabled && !c.enabled()) return true;
  c.run();
  return true;
}
