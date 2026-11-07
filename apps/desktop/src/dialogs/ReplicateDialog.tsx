import type { ReplicateOptions } from "@nexfem/model-core";
import { useState } from "react";
import { Field, NumberField } from "../components/fields.tsx";
import { Modal } from "../components/Modal.tsx";
import { useT } from "../i18n/index.ts";
import { useModel } from "../stores/model.ts";
import { useUi } from "../stores/ui.ts";

type Mode = ReplicateOptions["mode"];

export function ReplicateDialog({ onClose }: { onClose(): void }) {
  const T = useT();
  const R = T.replicate;
  const model = useModel((s) => s.model);
  const selection = useModel((s) => s.selection);
  const locked = useModel((s) => s.locked);
  const [mode, setMode] = useState<Mode>("linear");
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [dz, setDz] = useState(0);
  const [count, setCount] = useState(1);
  const grid = model.grids[0];
  const lines = grid ? [...grid.x.map((l) => ({ ...l, axis: "x" as const })), ...grid.y.map((l) => ({ ...l, axis: "y" as const }))] : [];
  const [mirrorLine, setMirrorLine] = useState(lines[0]?.id ?? "");
  const [stories, setStories] = useState<string[]>([]);
  const [copyLoads, setCopyLoads] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const line = lines.find((l) => l.id === mirrorLine);
  const options: ReplicateOptions | null =
    mode === "linear"
      ? Math.hypot(dx, dy, dz) > 1e-9 && count >= 1
        ? { mode, dx, dy, dz, count: Math.round(count) }
        : null
      : mode === "mirror"
        ? line
          ? { mode, axis: line.axis, value: line.coord }
          : null
        : stories.length
          ? { mode, stories }
          : null;

  const ok = () => {
    if (!options) return;
    const r = useModel.getState().run("objects.replicate", { ids: selection, options, copyLoads }, R.title);
    if (!r.ok) return setError(r.error);
    const { created, skipped } = r.result as { created: string[]; skipped: number };
    useUi.getState().log(skipped ? "warning" : "success", T.fmt(R.result, { created: created.length, skipped }));
    useModel.getState().select(created);
    onClose();
  };

  return (
    <Modal
      title={R.title}
      onClose={onClose}
      width={520}
      testId="dlg-replicate"
      footer={
        <>
          <div className={`modal-error${error ? " is-error" : ""}`} role="alert">
            {error ?? (selection.length ? T.fmt(R.selected, { n: selection.length }) : R.none)}
          </div>
          <button className="btn" onClick={onClose}>
            {T.dlg.cancel}
          </button>
          <button className="btn primary" disabled={!options || !selection.length || locked} onClick={ok} data-testid="dialog-ok">
            {T.dlg.ok}
          </button>
        </>
      }
    >
      <div className="seg-tabs left dialog-tabs" role="tablist">
        {(["linear", "mirror", "story"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>
            {R[m]}
          </button>
        ))}
      </div>
      {mode === "linear" && (
        <>
          <Field label="dx">
            <NumberField value={dx} onChange={setDx} quantity="length" units={model.units} label="dx" testId="rep-dx" />
          </Field>
          <Field label="dy">
            <NumberField value={dy} onChange={setDy} quantity="length" units={model.units} label="dy" testId="rep-dy" />
          </Field>
          <Field label="dz">
            <NumberField value={dz} onChange={setDz} quantity="length" units={model.units} label="dz" />
          </Field>
          <Field label={R.count}>
            <NumberField value={count} onChange={setCount} min={1} label={R.count} testId="rep-count" />
          </Field>
        </>
      )}
      {mode === "mirror" && (
        <Field label={R.axis}>
          <select value={mirrorLine} onChange={(e) => setMirrorLine(e.target.value)} aria-label={R.axis}>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label} ({l.axis.toUpperCase()} = {l.coord})
              </option>
            ))}
          </select>
        </Field>
      )}
      {mode === "story" && (
        <Field label={R.stories}>
          <div className="story-checks">
            {[...model.stories]
              .filter((s) => s.height > 0)
              .reverse()
              .map((s) => (
                <label key={s.id} className="inline-check">
                  <input
                    type="checkbox"
                    checked={stories.includes(s.id)}
                    onChange={(e) => setStories((l) => (e.target.checked ? [...l, s.id] : l.filter((x) => x !== s.id)))}
                  />
                  {s.name}
                </label>
              ))}
          </div>
        </Field>
      )}
      <label className="inline-check">
        <input type="checkbox" checked={copyLoads} onChange={(e) => setCopyLoads(e.target.checked)} /> {R.copyLoads}
      </label>
    </Modal>
  );
}
