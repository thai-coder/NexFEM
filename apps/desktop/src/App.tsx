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
import { Viewport } from "./panels/viewport/Viewport.tsx";
import { basename, confirmDiscardAsync } from "./services/files.ts";
import { notifyReady, onCloseRequested, setWindowTitle } from "./services/tauri.ts";
import { CommandPalette } from "./shell/CommandPalette.tsx";
import { ContextMenu } from "./shell/ContextMenu.tsx";
import { Dialogs } from "./shell/Dialogs.tsx";
import { ErrorBoundary } from "./shell/ErrorBoundary.tsx";
import { MenuBar } from "./shell/MenuBar.tsx";
import { Ribbon } from "./shell/Ribbon.tsx";
import { StatusBar } from "./shell/StatusBar.tsx";
import { useModel } from "./stores/model.ts";
import { load, remove, save } from "./stores/persist.ts";
import { useUi, type PanelVisibility } from "./stores/ui.ts";

const LAYOUT_KEY = "dock-layout-v2";

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
}

function buildDefault(api: DockviewApi, T: Strings, panels: PanelVisibility) {
  api.clear();
  api.addPanel({ id: "viewport", component: "viewport", title: T.panel.viewport, tabComponent: "pinned" });
  if (panels.explorer) addSide(api, "explorer", T);
  if (panels.properties) addSide(api, "properties", T);
  if (panels.bottom) addSide(api, "bottom", T);
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
    // Đợi một khung hình để khung nhìn và panel đã vẽ xong.
    const id = requestAnimationFrame(() => void notifyReady());
    return () => cancelAnimationFrame(id);
  }, []);

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
      if (useUi.getState().paletteOpen || useUi.getState().dialog) return;
      if (e.key === "F1" && e.ctrlKey) {
        e.preventDefault();
        useUi.getState().set({ ribbonCollapsed: !useUi.getState().ribbonCollapsed });
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
      // Đồng bộ trạng thái panel với layout đã lưu.
      useUi.setState({
        panels: { explorer: !!api.getPanel("explorer"), properties: !!api.getPanel("properties"), bottom: !!api.getPanel("bottom") },
      });
    }
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
      <Ribbon />
      <main className="dock-host">
        <DockviewReact
          components={components}
          tabComponents={tabComponents}
          onReady={onReady}
          theme={theme === "dark" ? themeDark : themeLight}
          disableFloatingGroups={false}
        />
      </main>
      <StatusBar />
      <CommandPalette />
      <ContextMenu />
      <Dialogs />
    </div>
  );
}
