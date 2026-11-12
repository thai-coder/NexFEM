import { Icon } from "@nexfem/ui";
import { command, currentStory, runCommand, type CommandId } from "../commands/app.ts";
import { SplitButton } from "../components/SplitButton.tsx";
import { useT } from "../i18n/index.ts";
import { useModel } from "../stores/model.ts";
import { useUi } from "../stores/ui.ts";

/** Một hàng thanh công cụ kiểu ETABS: tệp, sửa, khung nhìn, tầng, Define/Assign, phân tích. */
export function Toolbar() {
  const T = useT();
  // Cập nhật trạng thái nút theo mô hình và giao diện.
  useModel();
  useUi();
  const hidden = useUi((s) => s.toolbarHidden);
  if (hidden) return null;
  return (
    <div className="toolbar" role="toolbar" aria-label="Toolbar" data-testid="toolbar">
      <Group>
        <Btn id="file.new" />
        <Btn id="file.open" />
        <Btn id="file.save" />
      </Group>
      <Group>
        <Btn id="edit.undo" />
        <Btn id="edit.redo" />
      </Group>
      <Group>
        <Btn id="view.plan" />
        <Btn id="view.elevation" />
        <Btn id="view.3d" />
        <SplitButton items={["view.layout1", "view.layout2", "view.layout4"]} title={T.menu.view} />
        <Btn id="view.zoomExtents" />
      </Group>
      <StoryGroup />
      <Group>
        <SplitButton
          mode="menu"
          label={T.menu.define}
          icon="material"
          title={T.menu.define}
          items={["define.grids", "define.materials", "define.frameSections", "define.shellSections", "define.loadPatterns", "define.loadCases", "define.combos"]}
        />
        <SplitButton
          mode="menu"
          label={T.menu.assign}
          icon="joint"
          title={T.menu.assign}
          items={["assign.restraint", "assign.section", "assign.releases", "assign.offsets", "assign.diaphragm", "assign.frameLoad", "assign.shellLoad"]}
        />
      </Group>
      <Group>
        <Btn id="analyze.check" />
        <Btn id="analyze.run" />
        <Btn id="analyze.unlock" />
      </Group>
      <LoadDisplay />
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="tb-group">{children}</div>;
}

function Btn({ id }: { id: CommandId }) {
  const T = useT();
  const c = command(id);
  const disabled = c.enabled ? !c.enabled() : false;
  const checked = c.checked?.() ?? false;
  const label = T.cmd[id].replace(/…$/, "");
  return (
    <button
      className={`tb-btn${checked ? " checked" : ""}`}
      disabled={disabled}
      aria-pressed={c.checked ? checked : undefined}
      title={`${label}${c.shortcut ? ` (${c.shortcut})` : ""}${c.phase ? ` · ${T.fmt(T.phase.badge, { n: c.phase })}` : ""}`}
      data-command={id}
      onClick={() => runCommand(id)}
    >
      <Icon name={c.icon ?? "info"} size={18} />
    </button>
  );
}

function StoryGroup() {
  const T = useT();
  const stories = useModel((s) => s.model.stories);
  useUi((s) => s.views);
  const cur = currentStory();
  const choose = (id: string) => {
    const s = useUi.getState();
    const pane = s.views[s.activePane]?.kind === "plan" ? s.activePane : Math.max(0, s.views.findIndex((v) => v.kind === "plan"));
    s.setView(pane, { kind: "plan", story: id });
  };
  return (
    <Group>
      <select className="tb-select" aria-label={T.menu.select} value={cur} onChange={(e) => choose(e.target.value)} data-testid="story-select">
        {[...stories].reverse().map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.elevation.toFixed(2)})
          </option>
        ))}
      </select>
      <button className="tb-btn small" title={`${T.cmd["view.storyUp"]} (PgUp)`} onClick={() => runCommand("view.storyUp")}>
        <Icon name="up" size={14} />
      </button>
      <button className="tb-btn small" title={`${T.cmd["view.storyDown"]} (PgDn)`} onClick={() => runCommand("view.storyDown")}>
        <Icon name="down" size={14} />
      </button>
    </Group>
  );
}

function LoadDisplay() {
  const T = useT();
  const patterns = useModel((s) => s.model.loadPatterns);
  const value = useUi((s) => s.loadDisplay);
  return (
    <Group>
      <Icon name="load" size={14} className="tb-icon" />
      <select
        className="tb-select"
        value={value ?? ""}
        aria-label={T.assign.show}
        title={T.assign.show}
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
    </Group>
  );
}
