import { frameLength, jointMap, sectionProperties, toDisplay, unitLabel } from "@nexfem/model-core";
import { readToken } from "@nexfem/ui";
import { DARK_THEME, LIGHT_THEME, StructureViewer, viewTitle, type ViewSpec, type ViewerTheme } from "@nexfem/viewer";
import { useEffect, useRef } from "react";
import { useT } from "../../i18n/index.ts";
import { useModel } from "../../stores/model.ts";
import { useUi } from "../../stores/ui.ts";

export function Viewport() {
  const layout = useUi((s) => s.layout);
  const panes = Array.from({ length: layout }, (_, i) => i);
  return (
    <div className={`viewport-grid layout-${layout}`} data-testid="viewport">
      {panes.map((i) => (
        <Pane key={i} index={i} />
      ))}
    </div>
  );
}

function viewerTheme(theme: "dark" | "light"): ViewerTheme {
  const base = theme === "dark" ? DARK_THEME : LIGHT_THEME;
  const tok = (name: string, fallback: string) => readToken(name) || fallback;
  return {
    ...base,
    selection: tok("--color-selection", base.selection),
    column: tok("--color-column", base.column),
    beam: tok("--color-beam", base.beam),
    brace: tok("--color-brace", base.brace),
    slab: tok("--color-slab", base.slab),
    wall: tok("--color-wall", base.wall),
  };
}

function encode(v: ViewSpec): string {
  if (v.kind === "3d") return "3d";
  if (v.kind === "plan") return `plan:${v.story}`;
  return `elev:${v.grid}:${v.line}`;
}

function decode(s: string): ViewSpec {
  const [k, a = "", b = ""] = s.split(":");
  if (k === "plan") return { kind: "plan", story: a };
  if (k === "elev") return { kind: "elevation", grid: a, line: b };
  return { kind: "3d" };
}

function Pane({ index }: { index: number }) {
  const T = useT();
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<StructureViewer | null>(null);
  const model = useModel((s) => s.model);
  const selection = useModel((s) => s.selection);
  const view = useUi((s) => s.views[index]) ?? { kind: "3d" };
  const theme = useUi((s) => s.theme);
  const active = useUi((s) => s.activePane === index);
  const zoomSeq = useUi((s) => s.zoomSeq);
  const hover = useUi((s) => (s.hover?.pane === index ? s.hover : null));
  const tool = useUi((s) => s.tool);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const v = new StructureViewer(el, {
      onSelect: (ids, mode) => {
        useUi.getState().set({ activePane: index });
        if (useUi.getState().tool !== "select" && ids.length === 0) return;
        useModel.getState().select(ids, mode);
      },
      onHover: (info) => useUi.getState().set({ hover: info ? { ...info, pane: index } : null }),
      onCursor: (p) => useUi.getState().set({ cursor: p }),
    });
    viewer.current = v;
    // Cho kiểm thử e2e truy cập viewer.
    (window as unknown as { __nexfemViewers?: StructureViewer[] }).__nexfemViewers ??= [];
    (window as unknown as { __nexfemViewers: StructureViewer[] }).__nexfemViewers[index] = v;
    return () => {
      v.dispose();
      viewer.current = null;
    };
  }, [index]);

  useEffect(() => {
    viewer.current?.setTheme(viewerTheme(theme));
  }, [theme]);
  useEffect(() => {
    viewer.current?.setView(view);
  }, [JSON.stringify(view)]);
  useEffect(() => {
    viewer.current?.setModel(model);
  }, [model]);
  useEffect(() => {
    viewer.current?.setSelection(selection);
  }, [selection]);
  useEffect(() => {
    if (zoomSeq && active) viewer.current?.zoomExtents();
  }, [zoomSeq]);

  const labels = { plan: T.view.plan, elevation: T.view.elevation, view3d: T.view.view3d, axis: T.view.axis };
  const grid = model.grids[0];

  return (
    <section
      className={`pane${active ? " active" : ""}`}
      onPointerDown={() => !active && useUi.getState().set({ activePane: index })}
      data-testid={`pane-${index}`}
    >
      <header className="pane-header">
        <select
          className="pane-title"
          aria-label={T.view.choose}
          value={encode(view)}
          onChange={(e) => useUi.getState().setView(index, decode(e.target.value))}
        >
          <option value="3d">{T.view.view3d}</option>
          <optgroup label={T.view.plan}>
            {[...model.stories].reverse().map((s) => (
              <option key={s.id} value={`plan:${s.id}`}>
                {T.view.plan} – {s.name}
              </option>
            ))}
          </optgroup>
          {grid && (
            <optgroup label={T.view.elevation}>
              {[...grid.x, ...grid.y].map((l) => (
                <option key={l.id} value={`elev:${grid.id}:${l.id}`}>
                  {T.view.elevation} – {T.view.axis} {l.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <span className="pane-sub">{viewTitle(model, view, labels)}</span>
        {tool !== "select" && <span className="pane-tool">{T.cmd[`draw.${tool}`]}</span>}
      </header>
      <div className="pane-canvas" ref={host} />
      {hover && <HoverTip id={hover.id} x={hover.x} y={hover.y} />}
    </section>
  );
}

function HoverTip({ id, x, y }: { id: string; x: number; y: number }) {
  const T = useT();
  const model = useModel((s) => s.model);
  const u = model.units;
  const f = model.frames.find((o) => o.id === id);
  const s = model.shells.find((o) => o.id === id);
  const j = model.joints.find((o) => o.id === id);
  let lines: string[] = [];
  if (f) {
    const sec = model.frameSections.find((x) => x.id === f.section);
    const L = frameLength(f, jointMap(model));
    lines = [`${T.props[f.kind]} ${f.label}`, `${sec?.name ?? "?"}`, `L = ${toDisplay(L, "length", u).toFixed(3)} ${unitLabel("length", u)}`];
    if (sec) lines.push(`A = ${toDisplay(sectionProperties(sec.geometry).A, "area", u).toPrecision(4)} ${unitLabel("area", u)}`);
  } else if (s) {
    lines = [`${T.props[s.kind]} ${s.label}`, model.shellSections.find((x) => x.id === s.section)?.name ?? "?"];
  } else if (j) {
    lines = [`${T.props.joint} ${j.label}`, `(${[j.x, j.y, j.z].map((v) => toDisplay(v, "length", u).toFixed(3)).join(", ")})`];
  }
  if (!lines.length) return null;
  return (
    <div className="hover-tip" style={{ left: x + 14, top: y + 34 }} role="tooltip">
      {lines.map((l, i) => (
        <div key={i} className={i === 0 ? "strong" : undefined}>
          {l}
        </div>
      ))}
    </div>
  );
}
