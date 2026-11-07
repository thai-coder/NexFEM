import { MATERIAL_LIBRARY, UNIT_PRESETS, createRcFrameModel, emptyModel } from "@nexfem/model-core";
import { Icon } from "@nexfem/ui";
import { useState } from "react";
import { Field } from "../components/fields.tsx";
import { Modal } from "../components/Modal.tsx";
import { useT } from "../i18n/index.ts";
import { basename, confirmDiscard, openPath, openProject, recentFiles } from "../services/files.ts";
import { isTauri } from "../services/tauri.ts";
import { useModel } from "../stores/model.ts";
import { useUi } from "../stores/ui.ts";
import { formatSpans, parseSpans } from "./spans.ts";

type Template = "frame" | "grid" | "blank";

export function NewModelDialog({ onClose }: { onClose(): void }) {
  const T = useT();
  const N = T.dlg.newModel;
  const [tpl, setTpl] = useState<Template>("frame");
  const [name, setName] = useState("Toa_nha_moi");
  const [xs, setXs] = useState("3@6");
  const [ys, setYs] = useState("2@7.2");
  const [hs, setHs] = useState("3.9, 4@3.6");
  const [col, setCol] = useState("400x400");
  const [beam, setBeam] = useState("300x600");
  const [slab, setSlab] = useState("120");
  const [concrete, setConcrete] = useState("B25");
  const [units, setUnits] = useState(UNIT_PRESETS[0]!.label);
  const recent = isTauri() ? recentFiles() : [];

  const xv = parseSpans(xs);
  const yv = parseSpans(ys);
  const hv = parseSpans(hs);
  const dims = (s: string) => {
    const m = /^\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*$/i.exec(s);
    return m && Number(m[1]) > 0 && Number(m[2]) > 0 ? { b: Number(m[1]) / 1000, h: Number(m[2]) / 1000 } : null;
  };
  const cv = dims(col);
  const bv = dims(beam);
  const sv = Number(slab) > 0 ? Number(slab) / 1000 : null;
  const needGrid = tpl !== "blank";
  const valid = !!name.trim() && (!needGrid || (xv && yv && hv && cv && bv && sv));

  const create = () => {
    if (!valid || !confirmDiscard()) return;
    const u = UNIT_PRESETS.find((p) => p.label === units)!.units;
    const model =
      tpl === "blank"
        ? emptyModel(name.trim(), u)
        : createRcFrameModel({
            name: name.trim(),
            xSpans: xv!,
            ySpans: yv!,
            storyHeights: hv!,
            column: cv!,
            beam: bv!,
            slabThickness: sv!,
            concrete,
            objects: tpl === "frame" ? "frame" : "grid",
            units: u,
          });
    useModel.getState().reset(model, null);
    useUi.getState().log("success", T.log.newModel);
    useUi.getState().set({ zoomSeq: useUi.getState().zoomSeq + 1 });
    onClose();
  };

  const err = (ok: unknown) => (ok ? undefined : "invalid");

  return (
    <Modal
      title={N.title}
      onClose={onClose}
      width={880}
      testId="dlg-newModel"
      footer={
        <>
          <div className="modal-error">
            {needGrid && xv && yv && hv
              ? T.fmt(N.summary, { x: xv.length, y: yv.length, n: hv.length, h: hv.reduce((a, b) => a + b, 0).toFixed(2) })
              : ""}
          </div>
          <button className="btn" onClick={onClose}>
            {T.dlg.cancel}
          </button>
          <button className="btn primary" disabled={!valid} onClick={create} data-testid="create-model">
            {N.create}
          </button>
        </>
      }
    >
      <div className="new-model-layout">
        <aside className="recent-list">
          <h4 className="form-subtitle">{N.recent}</h4>
          {recent.length === 0 && <p className="muted small">{N.noRecent}</p>}
          {recent.map((r) => (
            <button
              key={r.path}
              className="define-item"
              title={r.path}
              onClick={async () => {
                if (!confirmDiscard()) return;
                if (await openPath(r.path)) onClose();
              }}
            >
              <Icon name="folder" size={14} />
              <span>{basename(r.path)}</span>
            </button>
          ))}
          <button
            className="btn small"
            onClick={async () => {
              if (await openProject()) onClose();
            }}
          >
            <Icon name="open" size={12} /> {N.openOther}
          </button>
        </aside>
        <div>
          <div className="template-cards" role="radiogroup" aria-label={N.template}>
            {(
              [
                ["frame", N.tplFrame, N.tplFrameDesc, "view3d"],
                ["grid", N.tplGrid, N.tplGridDesc, "grid"],
                ["blank", N.tplBlank, N.tplBlankDesc, "new"],
              ] as const
            ).map(([k, title, desc, icon]) => (
              <button key={k} role="radio" aria-checked={tpl === k} className={`template-card${tpl === k ? " active" : ""}`} onClick={() => setTpl(k)}>
                <Icon name={icon} size={22} />
                <strong>{title}</strong>
                <span>{desc}</span>
              </button>
            ))}
          </div>
          <Field label={T.dlg.name}>
            <input value={name} onChange={(e) => setName(e.target.value)} data-testid="new-name" />
          </Field>
          <Field label={N.units}>
            <select value={units} onChange={(e) => setUnits(e.target.value)}>
              {UNIT_PRESETS.map((p) => (
                <option key={p.label}>{p.label}</option>
              ))}
            </select>
          </Field>
          {needGrid && (
            <>
              <Field label={N.xSpans} hint={N.spansHint}>
                <input value={xs} aria-invalid={!!err(xv)} onChange={(e) => setXs(e.target.value)} onBlur={() => xv && setXs(formatSpans(xv))} data-testid="new-xs" />
              </Field>
              <Field label={N.ySpans}>
                <input value={ys} aria-invalid={!!err(yv)} onChange={(e) => setYs(e.target.value)} onBlur={() => yv && setYs(formatSpans(yv))} data-testid="new-ys" />
              </Field>
              <Field label={N.stories}>
                <input value={hs} aria-invalid={!!err(hv)} onChange={(e) => setHs(e.target.value)} onBlur={() => hv && setHs(formatSpans(hv))} data-testid="new-hs" />
              </Field>
              <Field label={N.concrete}>
                <select value={concrete} onChange={(e) => setConcrete(e.target.value)}>
                  {MATERIAL_LIBRARY.filter((m) => m.type === "concrete").map((m) => (
                    <option key={m.id}>{m.name}</option>
                  ))}
                </select>
              </Field>
              <Field label={N.column}>
                <input value={col} aria-invalid={!!err(cv)} onChange={(e) => setCol(e.target.value)} />
              </Field>
              <Field label={N.beam}>
                <input value={beam} aria-invalid={!!err(bv)} onChange={(e) => setBeam(e.target.value)} />
              </Field>
              <Field label={N.slab}>
                <input value={slab} aria-invalid={!!err(sv)} onChange={(e) => setSlab(e.target.value)} />
              </Field>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
