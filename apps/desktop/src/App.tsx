import {
  DockviewDefaultTab,
  DockviewReact,
  themeDark,
  themeLight,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from "dockview-react";
import { useEffect, useRef } from "react";
import { handleShortcut } from "./commands/app.ts";
import { useT, type T as Strings } from "./i18n/index.ts";
import { BottomPanel } from "./panels/console/BottomPanel.tsx";
import { ModelExplorer } from "./panels/model-explorer/ModelExplorer.tsx";
import { Properties } from "./panels/properties/Properties.tsx";
import { showStartAtStartup, StartPage } from "./panels/start/StartPage.tsx";
import { Viewport } from "./panels/viewport/Viewport.tsx";
import { basename, confirmDiscardAsync, openPath } from "./services/files.ts";
import { launchFile, notifyReady, onCloseRequested, setWindowTitle } from "./services/tauri.ts";
import { CommandPalette } from "./shell/CommandPalette.tsx";
import { ContextMenu } from "./shell/ContextMenu.tsx";
import { Dialogs } from "./shell/Dialogs.tsx";
import { ErrorBoundary } from "./shell/ErrorBoundary.tsx";
import { MenuBar } from "./shell/MenuBar.tsx";
import { ToolStrip } from "./shell/ToolStrip.tsx";
import { Toolbar } from "./shell/Toolbar.tsx";
import { StatusBar } from "./shell/StatusBar.tsx";
import { useModel } from "./stores/model.ts";
import { load, remove, save } from "./stores/persist.ts";
import { useUi, type PanelVisibility } from "./stores/ui.ts";

const LAYOUT_KEY = "dock-layout-v3";

/** Cửa sổ công cụ không chặn: phím tắt và thao tác trên khung nhìn vẫn hoạt động khi chúng mở. */
const MODELESS = new Set(["assignRestraint", "assignSection", "assignReleases", "assignFrameLoad", "assignShellLoad", "assignJointLoad"]);

/** Giới hạn kích thước từng bảng để bảng không bao giờ che hết khung nhìn. */
const LIMITS = {
  explorer: { constraints: { minimumWidth: 160, maximumWidth: 360 }, size: { width: 220 } },
  properties: { constraints: { minimumWidth: 200, maximumWidth: 400 }, size: { width: 270 } },
  bottom: { constraints: { minimumHeight: 90, maximumHeight: 320 }, size: { height: 150 } },
} as const;

function limit(api: DockviewApi, id: SidePanel, resize: boolean) {
  const p = api.getPanel(id);
  if (!p) return;
  p.api.setConstraints(LIMITS[id].constraints);
  if (resize) p.api.setSize(LIMITS[id].size);
}

const components: Record<string, React.FunctionComponent<IDockviewPanelProps>> = {
  explorer: () => (
    <ErrorBoundary name="Model Explorer">
      <ModelExplorer />
    </ErrorBoundary>
  ),
  viewport: () => (
    <ErrorBoundary name="Viewport">
      <Viewport />
    </ErrorBoundary>
  ),
  start: () => (
    <ErrorBoundary name="Start Page">
      <StartPage />
    </ErrorBoundary>
  ),
  properties: () => (
    <ErrorBoundary name="Properties">
      <Properties />
    </ErrorBoundary>
  ),
  bottom: () => (
    <ErrorBoundary name="Console">
      <BottomPanel />
    </ErrorBoundary>
  ),
};

const tabComponents: Record<string, React.FunctionComponent<IDockviewPanelHeaderProps>> = {
  pinned: (props) => <DockviewDefaultTab {...props} hideClose />,
};

type SidePanel = "explorer" | "properties" | "bottom";
const PANEL_OF: Record<keyof PanelVisibility, SidePanel> = { explorer: "explorer", properties: "properties", bottom: "bottom" };

function titleOf(id: string, T: Strings): string {
  if (id === "explorer") return T.panel.explorer;
  if (id === "properties") return T.panel.properties;
  if (id === "bottom") return T.panel.console;
  if (id === "start") return T.panel.start;
  return T.panel.viewport;
}

function addSide(api: DockviewApi, id: SidePanel, T: Strings) {
  if (api.getPanel(id)) return;
  const direction = id === "explorer" ? "left" : id === "properties" ? "right" : "below";
  api.addPanel({
    id,
    component: id,
    title: titleOf(id, T),
    position: { referencePanel: "viewport", direction },
    ...(id === "bottom" ? { initialHeight: 150 } : { initialWidth: id === "explorer" ? 220 : 270 }),
  });
  // Dockview chia đôi khi thêm lại bảng; ép đúng kích thước và giới hạn.
  limit(api, id, true);
}

function buildDefault(api: DockviewApi, T: Strings, panels: PanelVisibility) {
  api.clear();
  // renderer "always": đổi sang tab Trang chủ không huỷ khung nhìn 3D.
  api.addPanel({ id: "viewport", component: "viewport", title: T.panel.viewport, tabComponent: "pinned", renderer: "always" });
  if (panels.explorer) addSide(api, "explorer", T);
  if (panels.properties) addSide(api, "properties", T);
  if (panels.bottom) addSide(api, "bottom", T);
}

/** Mở (hoặc kích hoạt) tab Trang chủ cạnh khung nhìn. */
function openStart(api: DockviewApi, T: Strings, activate: boolean) {
  const existing = api.getPanel("start");
  if (existing) {
    if (activate) existing.api.setActive();
    return;
  }
  api.addPanel({
    id: "start",
    component: "start",
    title: T.panel.start,
    position: { referencePanel: "viewport", direction: "within" },
    inactive: !activate,
  });
  if (!activate) api.getPanel("viewport")?.api.setActive();
}

export function App() {
  const T = useT();
  const theme = useUi((s) => s.theme);
  const panels = useUi((s) => s.panels);
  const apiRef = useRef<DockviewApi | null>(null);
  const name = useModel((s) => s.model.name);
  const dirty = useModel((s) => s.dirty);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const fileName = useModel((s) => s.fileName);
  useEffect(() => {
    const title = `NexFEM — ${fileName ? basename(fileName) : `${name}.nxf`}${dirty ? " •" : ""}`;
    document.title = title;
    void setWindowTitle(title);
  }, [name, dirty, fileName]);

  useEffect(() => {
    // Cửa sổ chính đang ẩn nên requestAnimationFrame không chạy; dùng bộ đếm giờ để đợi bố cục xong.
    // Mở app bằng bấm đúp file .nxf: nạp file đó (mô hình trống chưa sửa nên không hỏi lưu) rồi mới báo sẵn sàng.
    const id = window.setTimeout(async () => {
      const path = await launchFile();
      const opened = path && (await openPath(path)) ? useModel.getState().model.name : undefined;
      void notifyReady(opened);
    }, 60);
    // Khi cửa sổ vừa hiện, áp lại kích thước các bảng (lúc ẩn dockview đo được 0).
    const onVisible = () => {
      const api = apiRef.current;
      if (document.visibilityState !== "visible" || !api) return;
      for (const sid of ["explorer", "properties", "bottom"] as const) limit(api, sid, true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    const openStartTab = () => apiRef.current && openStart(apiRef.current, T, true);
    const focusView = () => apiRef.current?.getPanel("viewport")?.api.setActive();
    window.addEventListener("nexfem:start-page", openStartTab);
    window.addEventListener("nexfem:focus-viewport", focusView);
    return () => {
      window.removeEventListener("nexfem:start-page", openStartTab);
      window.removeEventListener("nexfem:focus-viewport", focusView);
    };
  }, [T]);

  // Hỏi trước khi đóng cửa sổ khi còn thay đổi chưa lưu.
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (useModel.getState().dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    let unlisten: (() => void) | undefined;
    void onCloseRequested(() => confirmDiscardAsync()).then((u) => (unlisten = u));
    return () => {
      window.removeEventListener("beforeunload", before);
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = useUi.getState().dialog;
      if (useUi.getState().paletteOpen || (d && !MODELESS.has(d.kind))) return;
      if (e.key === "F1" && e.ctrlKey) {
        e.preventDefault();
        useUi.getState().set({ toolbarHidden: !useUi.getState().toolbarHidden });
        return;
      }
      handleShortcut(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Đồng bộ ẩn/hiện panel (F2/F4/F8) với dockview.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    for (const key of Object.keys(PANEL_OF) as (keyof PanelVisibility)[]) {
      const id = PANEL_OF[key];
      const p = api.getPanel(id);
      if (panels[key] && !p) addSide(api, id, T);
      if (!panels[key] && p) api.removePanel(p);
    }
  }, [panels]);

  // Đổi tiêu đề tab theo ngôn ngữ.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    for (const p of api.panels) p.api.setTitle(titleOf(p.id, T));
  }, [T]);

  useEffect(() => {
    const reset = () => {
      const api = apiRef.current;
      if (!api) return;
      remove(LAYOUT_KEY);
      const all = { explorer: true, properties: true, bottom: true };
      useUi.setState({ panels: all });
      save("panels", all);
      buildDefault(api, T, all);
    };
    window.addEventListener("nexfem:reset-layout", reset);
    return () => window.removeEventListener("nexfem:reset-layout", reset);
  }, [T]);

  const onReady = (e: DockviewReadyEvent) => {
    const api = e.api;
    apiRef.current = api;
    const saved = load<unknown>(LAYOUT_KEY, null);
    let ok = false;
    if (saved) {
      try {
        api.fromJSON(saved as Parameters<DockviewApi["fromJSON"]>[0]);
        ok = !!api.getPanel("viewport");
      } catch {
        ok = false;
      }
    }
    if (!ok) buildDefault(api, T, useUi.getState().panels);
    else {
      for (const id of ["explorer", "properties", "bottom"] as const) limit(api, id, false);
      // Đồng bộ trạng thái panel với layout đã lưu.
      useUi.setState({
        panels: { explorer: !!api.getPanel("explorer"), properties: !!api.getPanel("properties"), bottom: !!api.getPanel("bottom") },
      });
    }
    // Trang chủ theo tuỳ chọn "hiện khi khởi động", không theo layout đã lưu.
    const start = api.getPanel("start");
    if (showStartAtStartup()) openStart(api, T, true);
    else if (start) api.removePanel(start);
    api.onDidLayoutChange(() => save(LAYOUT_KEY, api.toJSON()));
    api.onDidRemovePanel((p) => {
      const key = (Object.keys(PANEL_OF) as (keyof PanelVisibility)[]).find((k) => PANEL_OF[k] === p.id);
      if (key && useUi.getState().panels[key]) {
        const next = { ...useUi.getState().panels, [key]: false };
        useUi.setState({ panels: next });
        save("panels", next);
      }
      if (p.id === "viewport") buildDefault(api, T, useUi.getState().panels);
    });
  };

  return (
    <div className="app">
      <MenuBar />
      <Toolbar />
      <div className="workspace">
        <ToolStrip />
        <main className="dock-host">
          <DockviewReact
            components={components}
            tabComponents={tabComponents}
            onReady={onReady}
            theme={theme === "dark" ? themeDark : themeLight}
            disableFloatingGroups={false}
          />
        </main>
      </div>
      <StatusBar />
      <CommandPalette />
      <ContextMenu />
      <Dialogs />
    </div>
  );
}
