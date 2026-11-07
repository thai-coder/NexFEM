import { allIds, uniqueId, type GridLine, type GridSystem, type Story } from "@nexfem/model-core";
import { Icon } from "@nexfem/ui";
import { useMemo, useState } from "react";
import { NumberField } from "../components/fields.tsx";
import { Modal } from "../components/Modal.tsx";
import { useT } from "../i18n/index.ts";
import { useModel } from "../stores/model.ts";

type StoryDraft = Omit<Story, "elevation">;

const X_LABELS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function nextLabel(lines: GridLine[], dir: "x" | "y"): string {
  const used = new Set(lines.map((l) => l.label));
  if (dir === "y") {
    for (let n = lines.length + 1; ; n++) if (!used.has(String(n))) return String(n);
  }
  for (const c of X_LABELS) if (!used.has(c)) return c;
  for (let n = 1; ; n++) if (!used.has(`X${n}`)) return `X${n}`;
}

function LinesTable({
  title,
  lines,
  onChange,
  dir,
  newId,
}: {
  title: string;
  lines: GridLine[];
  onChange(l: GridLine[]): void;
  dir: "x" | "y";
  newId(): string;
}) {
  const T = useT();
  const units = useModel((s) => s.model.units);
  const sorted = [...lines].sort((a, b) => a.coord - b.coord);
  return (
    <section className="grid-table">
      <h4 className="form-subtitle">{title}</h4>
      <table className="data-table compact" data-testid={`grid-${dir}`}>
        <thead>
          <tr>
            <th>{T.dlg.grid.label}</th>
            <th className="num">{T.dlg.grid.coord}</th>
            <th className="num">{T.dlg.grid.spacing}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.map((l, i) => {
            const prev = sorted[i - 1];
            return (
              <tr key={l.id}>
                <td>
                  <input className="cell-input" value={l.label} aria-label={T.dlg.grid.label} onChange={(e) => onChange(lines.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)))} />
                </td>
                <td className="num">
                  <NumberField
                    value={l.coord}
                    quantity="length"
                    units={units}
                    width={110}
                    label={T.dlg.grid.coord}
                    testId={`coord-${dir}-${l.label}`}
                    onChange={(v) => onChange(lines.map((x) => (x.id === l.id ? { ...x, coord: v } : x)))}
                  />
                </td>
                <td className="num">
                  {prev ? (
                    <NumberField
                      value={l.coord - prev.coord}
                      quantity="length"
                      units={units}
                      min={1e-6}
                      width={110}
                      label={T.dlg.grid.spacing}
                      onChange={(v) => {
                        // Đổi khoảng cách: dời trục này và mọi trục phía sau.
                        const delta = prev.coord + v - l.coord;
                        const after = new Set(sorted.slice(i).map((x) => x.id));
                        onChange(lines.map((x) => (after.has(x.id) ? { ...x, coord: x.coord + delta } : x)));
                      }}
                    />
                  ) : (
                    <span className="muted">{T.dlg.grid.none}</span>
                  )}
                </td>
                <td>
                  <button className="icon-btn" aria-label={T.dlg.delete} disabled={lines.length <= 1} onClick={() => onChange(lines.filter((x) => x.id !== l.id))}>
                    <Icon name="close" size={12} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        className="btn small"
        onClick={() => {
          const last = sorted.at(-1);
          const step = sorted.length > 1 ? last!.coord - sorted.at(-2)!.coord : 6;
          onChange([...lines, { id: newId(), label: nextLabel(lines, dir), coord: (last?.coord ?? -step) + step }]);
        }}
      >
        <Icon name="plus" size={12} /> {T.dlg.grid.addLine}
      </button>
    </section>
  );
}

/** Hình xem trước: mặt bằng lưới và mặt cắt tầng. */
function Preview({ grid, stories }: { grid: GridSystem; stories: StoryDraft[] }) {
  const xs = grid.x.map((l) => l.coord);
  const ys = grid.y.map((l) => l.coord);
  const [x0, x1] = [Math.min(...xs, 0), Math.max(...xs, 1)];
  const [y0, y1] = [Math.min(...ys, 0), Math.max(...ys, 1)];
  const S = 150 / Math.max(x1 - x0, y1 - y0, 1);
  const px = (x: number) => 20 + (x - x0) * S;
  const py = (y: number) => 175 - (y - y0) * S;
  let z = 0;
  const elevs = stories.map((s, i) => (i === 0 ? z : (z += s.height)));
  const zMax = Math.max(z, 1);
  const H = 160 / zMax;
  return (
    <div className="grid-preview" aria-hidden="true">
      <svg viewBox="0 0 200 200" width="200" height="200">
        {grid.x.map((l) => (
          <g key={l.id}>
            <line x1={px(l.coord)} x2={px(l.coord)} y1={py(y0) + 8} y2={py(y1) - 8} className="gp-line" />
            <text x={px(l.coord)} y={py(y1) - 11} className="gp-label">
              {l.label}
            </text>
          </g>
        ))}
        {grid.y.map((l) => (
          <g key={l.id}>
            <line y1={py(l.coord)} y2={py(l.coord)} x1={px(x0) - 8} x2={px(x1) + 8} className="gp-line" />
            <text y={py(l.coord) + 3} x={px(x0) - 13} className="gp-label">
              {l.label}
            </text>
          </g>
        ))}
      </svg>
      <svg viewBox="0 0 120 200" width="120" height="200">
        {elevs.map((e, i) => (
          <g key={stories[i]!.id}>
            <line x1="10" x2="70" y1={185 - e * H} y2={185 - e * H} className={i === 0 ? "gp-base" : "gp-story"} />
            <text x="74" y={188 - e * H} className="gp-label start">
              {stories[i]!.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function GridStoryDialog({ onClose }: { onClose(): void }) {
  const T = useT();
  const model = useModel((s) => s.model);
  const locked = useModel((s) => s.locked);
  const executeBatch = useModel((s) => s.executeBatch);
  const original = model.grids[0];
  const [grid, setGrid] = useState<GridSystem>(() => structuredClone(original ?? { id: "grid-main", name: "Lưới chính", x: [], y: [] }));
  const [stories, setStories] = useState<StoryDraft[]>(() =>
    model.stories.length ? model.stories.map(({ elevation: _e, ...s }) => s) : [{ id: "story-0", name: "Base", height: 0, masterStory: false }],
  );
  const [moveJoints, setMoveJoints] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const used = useMemo(() => new Set(allIds(model)), [model]);
  const newId = (p: string) => {
    const id = uniqueId(p, [...used, ...grid.x.map((l) => l.id), ...grid.y.map((l) => l.id), ...stories.map((s) => s.id)]);
    used.add(id);
    return id;
  };
  const base = model.stories[0]?.elevation ?? 0;
  let z = base;
  const elev = stories.map((s, i) => (i === 0 ? z : (z += s.height)));

  const ops = () => {
    const out: { name: string; args: unknown }[] = [];
    if (JSON.stringify(grid) !== JSON.stringify(original)) out.push({ name: "grid.set", args: { grid, moveJoints } });
    const origStories = model.stories.map(({ elevation: _e, ...s }) => s);
    if (JSON.stringify(stories) !== JSON.stringify(origStories)) out.push({ name: "stories.set", args: { stories, baseElevation: base } });
    return out;
  };
  const apply = (close: boolean) => {
    const o = ops();
    const err = o.length ? executeBatch(T.dlg.grid.title, o) : null;
    setError(err);
    if (!err && close) onClose();
  };
  const setStory = (id: string, patch: Partial<StoryDraft>) => setStories((l) => l.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  return (
    <Modal
      title={T.dlg.grid.title}
      onClose={onClose}
      width={1080}
      testId="dlg-gridStory"
      footer={
        <>
          <label className="modal-error inline-check">
            {error ? (
              <span role="alert">{error}</span>
            ) : (
              <>
                <input type="checkbox" checked={moveJoints} onChange={(e) => setMoveJoints(e.target.checked)} /> {T.dlg.grid.moveJoints}
              </>
            )}
          </label>
          <button className="btn" onClick={onClose}>
            {T.dlg.cancel}
          </button>
          <button className="btn" disabled={locked} onClick={() => apply(false)}>
            {T.dlg.apply}
          </button>
          <button className="btn primary" disabled={locked} onClick={() => apply(true)} data-testid="dialog-ok">
            {T.dlg.ok}
          </button>
        </>
      }
    >
      <fieldset className="plain-fieldset grid-story-layout" disabled={locked}>
        <LinesTable title={T.dlg.grid.xLines} lines={grid.x} dir="x" newId={() => newId("gx")} onChange={(x) => setGrid((g) => ({ ...g, x }))} />
        <LinesTable title={T.dlg.grid.yLines} lines={grid.y} dir="y" newId={() => newId("gy")} onChange={(y) => setGrid((g) => ({ ...g, y }))} />
        <section className="grid-table">
          <h4 className="form-subtitle">{T.dlg.grid.stories}</h4>
          <table className="data-table compact" data-testid="stories-table">
            <thead>
              <tr>
                <th>{T.dlg.name}</th>
                <th className="num">{T.dlg.grid.height}</th>
                <th className="num">{T.dlg.grid.elevation}</th>
                <th>{T.dlg.grid.master}</th>
                <th>{T.dlg.grid.similar}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...stories]
                .map((s, i) => ({ s, i }))
                .reverse()
                .map(({ s, i }) => (
                  <tr key={s.id}>
                    <td>
                      <input className="cell-input" value={s.name} aria-label={T.dlg.name} onChange={(e) => setStory(s.id, { name: e.target.value })} />
                    </td>
                    <td className="num">
                      {i === 0 ? (
                        <span className="muted">{T.dlg.grid.base}</span>
                      ) : (
                        <NumberField
                          value={s.height}
                          quantity="length"
                          units={model.units}
                          min={1e-6}
                          width={100}
                          label={T.dlg.grid.height}
                          testId={`height-${s.name}`}
                          onChange={(height) => setStory(s.id, { height })}
                        />
                      )}
                    </td>
                    <td className="num mono">{elev[i]!.toFixed(3)}</td>
                    <td>{i > 0 && <input type="checkbox" checked={s.masterStory} aria-label={T.dlg.grid.master} onChange={(e) => setStory(s.id, { masterStory: e.target.checked })} />}</td>
                    <td>
                      {i > 0 && (
                        <select
                          value={s.similarTo ?? ""}
                          aria-label={T.dlg.grid.similar}
                          onChange={(e) => setStory(s.id, e.target.value ? { similarTo: e.target.value } : { similarTo: undefined } as Partial<StoryDraft>)}
                        >
                          <option value="">{T.dlg.grid.none}</option>
                          {stories
                            .filter((o, j) => j > 0 && o.id !== s.id && o.masterStory)
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {i > 0 && (
                        <button className="icon-btn" aria-label={T.dlg.delete} onClick={() => setStories((l) => l.filter((x) => x.id !== s.id))}>
                          <Icon name="close" size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <button
            className="btn small"
            data-testid="add-story"
            onClick={() => {
              const last = stories.at(-1);
              const h = last && last.height > 0 ? last.height : 3.6;
              const names = new Set(stories.map((s) => s.name));
              let n = stories.length;
              while (names.has(`Tầng ${n}`)) n++;
              setStories((l) => [...l, { id: newId("story"), name: `Tầng ${n}`, height: h, masterStory: false }]);
            }}
          >
            <Icon name="plus" size={12} /> {T.dlg.grid.addStory}
          </button>
        </section>
        <Preview grid={grid} stories={stories} />
      </fieldset>
    </Modal>
  );
}
