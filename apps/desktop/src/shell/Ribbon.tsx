import { Icon } from "@nexfem/ui";
import type { ReactNode } from "react";
import { command, currentStory, runCommand, type CommandId } from "../commands/app.ts";
import { useT } from "../i18n/index.ts";
import { useModel } from "../stores/model.ts";
import { useUi, type RibbonTab, type StoryScope } from "../stores/ui.ts";

const TABS: RibbonTab[] = ["modeling", "loads", "analysis", "results", "design"];

export function Ribbon() {
  const T = useT();
  const tab = useUi((s) => s.ribbonTab);
  const collapsed = useUi((s) => s.ribbonCollapsed);
  const compact = useUi((s) => s.ribbonCompact);
  const set = useUi((s) => s.set);
  // Cập nhật trạng thái nút theo mô hình/giao diện.
  useModel();
  useUi();

  return (
    <div className={`ribbon${collapsed ? " collapsed" : ""}${compact ? " compact" : ""}`}>
      <div className="ribbon-tabs" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`ribbon-tab${tab === id ? " active" : ""}`}
            onClick={() => set({ ribbonTab: id, ribbonCollapsed: false })}
          >
            {T.ribbon[id]}
          </button>
        ))}
        <div className="menubar-spacer" />
        <button className={`icon-btn${compact ? " on" : ""}`} title={T.cmd["view.compactRibbon"]} aria-pressed={compact} onClick={() => runCommand("view.compactRibbon")}>
          <Icon name="layout1" size={14} />
        </button>
        <button
          className="icon-btn"
          title={collapsed ? T.ribbon.expand : T.ribbon.collapse}
          onClick={() => set({ ribbonCollapsed: !collapsed })}
        >
          <Icon name={collapsed ? "chevronDown" : "up"} size={14} />
        </button>
      </div>
      {!collapsed && (
        <div className="ribbon-body" role="tabpanel">
          {tab === "modeling" && (
            <>
              <Group label={T.ribbon.groupFile}>
                <Btn id="file.new" big />
                <Btn id="file.open" />
                <Btn id="file.save" />
              </Group>
              <Group label={T.ribbon.groupEdit}>
                <Btn id="edit.undo" />
                <Btn id="edit.redo" />
              </Group>
              <Group label={T.ribbon.groupDefine}>
                <Btn id="define.grids" />
                <Btn id="define.materials" />
                <Btn id="define.frameSections" />
                <Btn id="define.shellSections" />
              </Group>
              <Group label={T.ribbon.groupDraw}>
                <Btn id="draw.select" big />
                <Btn id="draw.joint" />
                <Btn id="draw.beam" />
                <Btn id="draw.column" />
                <Btn id="draw.brace" />
                <Btn id="draw.slab" />
                <Btn id="draw.wall" />
              </Group>
              <ViewGroup />
              <StoryGroup />
            </>
          )}
          {tab === "loads" && (
            <>
              <Group label={T.ribbon.groupDefine}>
                <Btn id="define.loadPatterns" big />
                <Btn id="define.loadCases" />
                <Btn id="define.combos" />
              </Group>
              <Group label={T.ribbon.groupAssign}>
                <Btn id="assign.restraint" />
                <Btn id="assign.section" />
                <Btn id="assign.releases" />
                <Btn id="assign.frameLoad" />
                <Btn id="assign.shellLoad" />
              </Group>
              <LoadDisplayGroup />
            </>
          )}
          {tab === "analysis" && (
            <Group label={T.ribbon.groupRun}>
              <Btn id="analyze.check" big />
              <Btn id="analyze.run" big />
              <Btn id="analyze.unlock" />
            </Group>
          )}
          {tab === "results" && (
            <Group label={T.ribbon.groupDiagrams}>
              <Btn id="display.deformed" big />
              <Btn id="display.moment" />
              <Btn id="display.shear" />
              <Btn id="display.axial" />
            </Group>
          )}
          {tab === "design" && (
            <Group label={T.ribbon.groupDesign}>
              <Btn id="design.concrete" big />
              <Btn id="design.steel" big />
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ribbon-group" role="group" aria-label={label}>
      <div className="ribbon-group-items">{children}</div>
      <div className="ribbon-group-label">{label}</div>
    </div>
  );
}

function Btn({ id, big }: { id: CommandId; big?: boolean }) {
  const T = useT();
  const c = command(id);
  const label = T.cmd[id].replace(/…$/, "");
  const disabled = c.enabled ? !c.enabled() : false;
  const checked = c.checked?.() ?? false;
  const compact = useUi((s) => s.ribbonCompact);
  const tip = [label, c.shortcut ? `(${c.shortcut})` : "", c.phase ? `· ${T.fmt(T.phase.badge, { n: c.phase })}` : ""].join(" ").trim();
  return (
    <button
      className={`ribbon-btn${big ? " big" : ""}${checked ? " checked" : ""}${c.phase ? " later" : ""}`}
      disabled={disabled}
      aria-pressed={c.checked ? checked : undefined}
      title={tip}
      data-command={id}
      onClick={() => runCommand(id)}
    >
      <Icon name={c.icon ?? "info"} size={big && !compact ? 22 : 16} />
      <span>{shortLabel(label)}</span>
    </button>
  );
}

/** Nhãn ngắn cho nút ribbon. */
function shortLabel(s: string): string {
  const v = s.replace(/^(Vẽ |Draw )/, "").replace(/\s*\(.*\)$/, "");
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function ViewGroup() {
  const T = useT();
  return (
    <Group label={T.ribbon.groupView}>
      <Btn id="view.plan" />
      <Btn id="view.elevation" />
      <Btn id="view.3d" />
      <div className="ribbon-stack">
        <Btn id="view.layout1" />
        <Btn id="view.layout2" />
        <Btn id="view.layout4" />
      </div>
      <Btn id="view.zoomExtents" />
    </Group>
  );
}

function StoryGroup() {
  const T = useT();
  const stories = useModel((s) => s.model.stories);
  const scope = useUi((s) => s.storyScope);
  const set = useUi((s) => s.set);
  useUi((s) => s.views);
  const cur = currentStory();
  const choose = (id: string) => {
    const s = useUi.getState();
    const pane = s.views[s.activePane]?.kind === "plan" ? s.activePane : Math.max(0, s.views.findIndex((v) => v.kind === "plan"));
    s.setView(pane, { kind: "plan", story: id });
  };
  return (
    <Group label={T.ribbon.groupStory}>
      <div className="story-control">
        <div className="story-row">
          <select aria-label={T.ribbon.groupStory} value={cur} onChange={(e) => choose(e.target.value)} data-testid="story-select">
            {[...stories].reverse().map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.elevation.toFixed(2)})
              </option>
            ))}
          </select>
          <button className="icon-btn" title={`${T.cmd["view.storyUp"]} (PgUp)`} onClick={() => runCommand("view.storyUp")}>
            <Icon name="up" size={14} />
          </button>
          <button className="icon-btn" title={`${T.cmd["view.storyDown"]} (PgDn)`} onClick={() => runCommand("view.storyDown")}>
            <Icon name="down" size={14} />
          </button>
        </div>
        <select aria-label="Story scope" value={scope} onChange={(e) => set({ storyScope: e.target.value as StoryScope })}>
          <option value="one">{T.story.one}</option>
          <option value="similar">{T.story.similar}</option>
          <option value="all">{T.story.all}</option>
        </select>
      </div>
    </Group>
  );
}

function LoadDisplayGroup() {
  const T = useT();
  const patterns = useModel((s) => s.model.loadPatterns);
  const value = useUi((s) => s.loadDisplay);
  return (
    <Group label={T.assign.show}>
      <div className="story-control">
        <select
          value={value ?? ""}
          aria-label={T.assign.show}
          data-testid="load-display"
          onChange={(e) => useUi.getState().set({ loadDisplay: e.target.value || null })}
        >
          <option value="">{T.assign.hide}</option>
          {patterns.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </Group>
  );
}
