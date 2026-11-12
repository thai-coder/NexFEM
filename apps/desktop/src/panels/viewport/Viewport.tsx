import { frameLength, jointMap, sectionProperties, toDisplay, unitLabel } from "@nexfem/model-core";
import { readToken } from "@nexfem/ui";
import { buildDeformedFrames, DARK_THEME, LIGHT_THEME, StructureViewer, viewTitle, type DeformedFrames, type ViewSpec, type ViewerTheme } from "@nexfem/viewer";
import { useEffect, useMemo, useRef, useState } from "react";
import { NumberField } from "../../components/fields.tsx";
import { useT } from "../../i18n/index.ts";
import { openContextMenu } from "../../commands/context.ts";
import { canDrawIn, finish, handlePoint, isPolygonTool } from "../../tools/draw.ts";
import { useModel } from "../../stores/model.ts";
import { selectDeformationCase, useResults } from "../../stores/results.ts";
import { useUi } from "../../stores/ui.ts";

export function Viewport() {
  const layout = useUi((s) => s.layout);
  const model = useModel((s) => s.model);
  const showDeformed = useResults((s) => s.showDeformed);
  const deformationCase = useResults(selectDeformationCase);
  const scale = useResults((s) => s.deformationScale);
  const deformed = useMemo(
    () => showDeformed && deformationCase ? buildDeformedFrames(model, deformationCase.displacements, scale) : null,
    [showDeformed, deformationCase, model, scale],
  );
  const panes = Array.from({ length: layout }, (_, i) => i);
  return (
    <div className={`viewport-grid layout-${layout}`} data-testid="viewport">
      {panes.map((i) => (
        <Pane key={i} index={i} deformed={deformed} deformationCaseName={deformationCase?.name} showDeformed={showDeformed} />
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

function Pane({ index, deformed, deformationCaseName, showDeformed }: {
  index: number;
  deformed: DeformedFrames | null;
  deformationCaseName: string | undefined;
  showDeformed: boolean;
}) {
  const T = useT();
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<StructureViewer | null>(null);
  const [hasDeformedShape, setHasDeformedShape] = useState(false);
  const model = useModel((s) => s.model);
  const selection = useModel((s) => s.selection);
  const view = useUi((s) => s.views[index]) ?? { kind: "3d" };
  const theme = useUi((s) => s.theme);
  const active = useUi((s) => s.activePane === index);
  const zoomSeq = useUi((s) => s.zoomSeq);
  const hover = useUi((s) => (s.hover?.pane === index ? s.hover : null));
  const tool = useUi((s) => s.tool);
  const snapModes = useUi((s) => s.snapModes);
  const drawPoints = useUi((s) => (s.drawPane === index ? s.drawPoints : null));
  const drawing = tool !== "select" && canDrawIn(view);
  const loadDisplay = useUi((s) => s.loadDisplay);
  const display = useUi((s) => s.display);
  const selectFilter = useUi((s) => s.selectFilter);
  const zoomAll = useUi((s) => s.zoomAll);
  const viewKey = JSON.stringify(view);

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
      onPoint: (snap) => {
        useUi.getState().set({ activePane: index });
        handlePoint(index, snap);
      },
      onFinish: () => finish(index),
      onContextMenu: ({ clientX, clientY, hit, grid }) => {
        const ui = useUi.getState();
        ui.set({ activePane: index });
        const ms = useModel.getState();
        if (hit && !ms.selection.includes(hit.id)) ms.select([hit.id]);
        openContextMenu(clientX, clientY, { grid });
      },
      onGridDoubleClick: () => {
        if (!useModel.getState().locked) useUi.getState().set({ dialog: { kind: "gridStory" } });
      },
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
  }, [viewKey]);
  useEffect(() => {
    viewer.current?.setModel(model);
  }, [model]);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    v.setDeformedShape(deformed);
    setHasDeformedShape(v.hasDeformedShape);
  }, [model, deformed, viewKey]);
  useEffect(() => {
    viewer.current?.setSelection(selection);
  }, [selection]);
  useEffect(() => {
    viewer.current?.setDisplay(display);
  }, [display]);
  useEffect(() => {
    viewer.current?.setSelectFilter(selectFilter);
  }, [selectFilter]);
  useEffect(() => {
    viewer.current?.setLoadDisplay(loadDisplay && model.loadPatterns.some((p) => p.id === loadDisplay) ? loadDisplay : null);
  }, [loadDisplay, model]);
  useEffect(() => {
    if (zoomSeq && (active || zoomAll)) viewer.current?.zoomExtents();
  }, [zoomSeq]);
  useEffect(() => {
    const T0 = T.draw.snapKinds;
    viewer.current?.setDrawing(
      drawing
        ? { modes: snapModes, preview: drawPoints ?? [], closed: isPolygonTool(tool, view), labels: { joint: T0.joint, grid: T0.grid, mid: T0.mid, gridline: T0.gridline } }
        : null,
    );
  }, [drawing, snapModes, drawPoints, tool, viewKey, model, T]);

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
        {view.kind === "3d" && (
          <span className="view-presets" title={T.view.orbitHint}>
            {(["top", "front", "right", "iso"] as const).map((p) => (
              <button key={p} className="preset-btn" data-testid={`preset-${p}`} onClick={() => viewer.current?.setViewPreset(p)}>
                {T.view.presets[p]}
              </button>
            ))}
          </span>
        )}
        {tool !== "select" && (
          <span className={`pane-tool${drawing ? "" : " off"}`} title={drawing ? T.draw.hint[tool] : T.draw.not3d}>
            {T.cmd[`draw.${tool}`]}
            {drawPoints?.length ? ` · ${T.fmt(T.draw.points, { n: drawPoints.length })}` : ""}
          </span>
        )}
      </header>
      {showDeformed && (
        <DeformationControls
          caseName={deformationCaseName}
          appliedScale={deformed?.scale}
          hasDeformedShape={hasDeformedShape}
          projected={view.kind !== "3d"}
          color={(theme === "dark" ? DARK_THEME : LIGHT_THEME).deformed}
        />
      )}
      <div className="pane-body">
        <div className="pane-canvas" ref={host} />
        {hover && !drawing && <HoverTip id={hover.id} x={hover.x} y={hover.y} />}
        {tool !== "select" && active && <div className="draw-hint">{drawing ? T.draw.hint[tool] : T.draw.not3d}</div>}
      </div>
    </section>
  );
}

function DeformationControls({ caseName, appliedScale, hasDeformedShape, projected, color }: {
  caseName: string | undefined;
  appliedScale: number | undefined;
  hasDeformedShape: boolean;
  projected: boolean;
  color: string;
}) {
  const { deformation: labels } = useT().analysis;
  const scale = useResults((s) => s.deformationScale);
  const setScale = useResults((s) => s.setDeformationScale);
  return (
    <div className="pane-deformation" style={{ borderInlineStartColor: color }} data-testid="deformation-controls">
      {caseName === undefined ? <span role="status">{labels.unsupported}</span> : (
        <>
          <span title={projected ? labels.projectionHint : labels.chordHint}>{labels.frames} · {caseName}</span>
          <label>
            {labels.scale}
            <NumberField value={scale ?? appliedScale ?? 1} onChange={setScale} min={Number.MIN_VALUE} label={labels.scale} width={76} testId="deformation-scale" />
            <span aria-hidden="true">×</span>
          </label>
          <button type="button" className="preset-btn" aria-pressed={scale === null} onClick={() => setScale(null)}>{labels.auto}</button>
          {appliedScale === undefined && <span role="status">{labels.unavailable}</span>}
          {appliedScale !== undefined && !hasDeformedShape && <span role="status">{labels.noVisibleFrames}</span>}
        </>
      )}
    </div>
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
    <div className="hover-tip" style={{ left: x + 14, top: y + 12 }} role="tooltip">
      {lines.map((l, i) => (
        <div key={i} className={i === 0 ? "strong" : undefined}>
          {l}
        </div>
      ))}
    </div>
  );
}
