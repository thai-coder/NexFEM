import { UNIT_PRESETS, toDisplay, unitsLabel } from "@nexfem/model-core";
import { Icon } from "@nexfem/ui";
import { runCommand } from "../commands/app.ts";
import { SnapToggles } from "../panels/properties/DrawProps.tsx";
import { useT } from "../i18n/index.ts";
import { useModel } from "../stores/model.ts";
import { useUi } from "../stores/ui.ts";

export function StatusBar() {
  const T = useT();
  const cursor = useUi((s) => s.cursor);
  const units = useModel((s) => s.model.units);
  const selection = useModel((s) => s.selection.length);
  const locked = useModel((s) => s.locked);
  const execute = useModel((s) => s.execute);
  const filter = useUi((s) => s.selectFilter);
  const panels = useUi((s) => s.panels);
  const focus = useUi((s) => s.focusMode);
  const fmt = (v: number) => toDisplay(v, "length", units).toFixed(units.length === "mm" ? 0 : units.length === "cm" ? 1 : 3);

  return (
    <footer className="statusbar">
      <span className="status-cell mono" data-testid="cursor">
        X {cursor ? fmt(cursor[0]) : "—"}&nbsp;&nbsp;Y {cursor ? fmt(cursor[1]) : "—"}&nbsp;&nbsp;Z {cursor ? fmt(cursor[2]) : "—"}
      </span>
      <span className="status-cell">
        {T.status.snap}: <SnapToggles />
      </span>
      <span className="status-cell" data-testid="selection-count">
        {T.fmt(T.status.selected, { n: selection })}
      </span>
      <button className={`status-cell status-btn${locked ? " warn" : ""}`} onClick={() => locked && runCommand("analyze.unlock")}>
        <Icon name={locked ? "lock" : "unlock"} size={13} />
        {locked ? T.status.locked : T.status.unlocked}
      </button>
      <span className="status-cell" role="group" aria-label={T.status.select}>
        {T.status.select}:
        {(["joint", "frame", "shell"] as const).map((k) => (
          <label key={k} className="snap-toggle">
            <input
              type="checkbox"
              checked={filter[k]}
              data-testid={`filter-${k}`}
              onChange={(e) => useUi.getState().set({ selectFilter: { ...filter, [k]: e.target.checked } })}
            />
            {k === "joint" ? T.explorer.joints : k === "frame" ? T.explorer.frames : T.explorer.shells}
          </label>
        ))}
      </span>
      <span className="menubar-spacer" />
      <span className="status-cell" role="group" aria-label={T.status.panels}>
        {(
          [
            ["explorer", "folder", "view.toggleExplorer"],
            ["properties", "section", "view.toggleProperties"],
            ["bottom", "terminal", "view.toggleBottom"],
          ] as const
        ).map(([k, icon, cmd]) => (
          <button key={k} className={`icon-btn${panels[k] ? " on" : ""}`} aria-pressed={panels[k]} title={T.cmd[cmd]} data-testid={`panel-${k}`} onClick={() => runCommand(cmd)}>
            <Icon name={icon} size={14} />
          </button>
        ))}
        <button className={`icon-btn${focus ? " on" : ""}`} aria-pressed={focus} title={`${T.cmd["view.focus"]} (Ctrl+Shift+F)`} data-testid="focus-mode" onClick={() => runCommand("view.focus")}>
          <Icon name="zoomExtents" size={14} />
        </button>
      </span>
      <label className="status-cell">
        {T.status.units}
        <select
          className="status-select"
          value={unitsLabel(units)}
          onChange={(e) => {
            const p = UNIT_PRESETS.find((x) => x.label === e.target.value);
            if (p) execute("model.setUnits", { units: p.units });
          }}
        >
          {UNIT_PRESETS.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
    </footer>
  );
}
