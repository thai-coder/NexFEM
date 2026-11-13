import {
  DESIGN_CODE_OPTIONS,
  MATERIAL_LIBRARY,
  UNIT_PRESETS,
  createRcFrameModel,
  emptyModel,
  simpleStoryHeights,
  uniformSpans,
  unitsLabel,
  type Model,
  type TemplateObjects,
} from "@nexfem/model-core";
import { Icon } from "@nexfem/ui";
import { useState } from "react";
import { Field } from "../components/fields.tsx";
import { Modal } from "../components/Modal.tsx";
import { useT } from "../i18n/index.ts";
import { basename, confirmDiscardAsync, openPath, openProject, pickProjectModel, recentFiles } from "../services/files.ts";
import { isTauri } from "../services/tauri.ts";
import { useModel } from "../stores/model.ts";
import { load, save } from "../stores/persist.ts";
import { useUi } from "../stores/ui.ts";
import { formatSpans, parseSpans } from "./spans.ts";

type Template = TemplateObjects | "blank";
type InitMode = "builtin" | "saved" | "file";
type Codes = { concrete: string; steel: string; loads: string };
/** Thiết lập khởi tạo: đơn vị và tiêu chuẩn thiết kế. */
interface InitSettings {
  units: Model["units"];
  designCodes: Record<string, string>;
}

const SAVED_KEY = "newModelDefaults";
const nonEmpty = (c: Record<string, string | undefined>) => Object.fromEntries(Object.entries(c).filter(([, v]) => v)) as Record<string, string>;
const count = (s: string) => (/^\d+$/.test(s.trim()) && Number(s) >= 1 && Number(s) <= 200 ? Number(s) : null);
const pos = (s: string) => (Number(s) > 0 && Number.isFinite(Number(s)) ? Number(s) : null);

export function NewModelDialog({ onClose }: { onClose(): void }) {
  const T = useT();
  const N = T.dlg.newModel;
  const [step, setStep] = useState<1 | 2>(1);

  // Bước 1: khởi tạo
  const [name, setName] = useState("Toa_nha_moi");
  const saved = load<InitSettings | null>(SAVED_KEY, null);
  const [mode, setMode] = useState<InitMode>("builtin");
  const [units, setUnits] = useState(UNIT_PRESETS[0]!.label);
  const [codes, setCodes] = useState<Codes>({
    concrete: DESIGN_CODE_OPTIONS.concrete[0],
    steel: DESIGN_CODE_OPTIONS.steel[0],
    loads: DESIGN_CODE_OPTIONS.loads[0],
  });
  const [fromFile, setFromFile] = useState<(InitSettings & { file: string }) | null>(null);
  const [saveDefault, setSaveDefault] = useState(false);

  // Bước 2: mẫu nhanh
  const [tpl, setTpl] = useState<Template>("frame");
  const [gridMode, setGridMode] = useState<"uniform" | "custom">("custom");
  const [storyMode, setStoryMode] = useState<"simple" | "custom">("custom");
  const [xs, setXs] = useState("3@6");
  const [ys, setYs] = useState("2@7.2");
  const [hs, setHs] = useState("3.9, 4@3.6");
  const [xn, setXn] = useState("3");
  const [xw, setXw] = useState("6");
  const [yn, setYn] = useState("2");
  const [yw, setYw] = useState("7.2");
  const [sn, setSn] = useState("5");
  const [st, setSt] = useState("3.6");
  const [sb, setSb] = useState("3.9");
  const [col, setCol] = useState("400x400");
  const [beam, setBeam] = useState("300x600");
  const [slab, setSlab] = useState("120");
  const [concrete, setConcrete] = useState("B25");
  const recent = isTauri() ? recentFiles() : [];

  const init: InitSettings | null =
    mode === "builtin"
      ? { units: UNIT_PRESETS.find((p) => p.label === units)!.units, designCodes: nonEmpty(codes) }
      : mode === "saved"
        ? saved
        : fromFile;
  const step1Valid = !!name.trim() && !!init;

  const xv = gridMode === "uniform" ? (count(xn) && pos(xw) ? uniformSpans(count(xn)!, pos(xw)!) : null) : parseSpans(xs);
  const yv = gridMode === "uniform" ? (count(yn) && pos(yw) ? uniformSpans(count(yn)!, pos(yw)!) : null) : parseSpans(ys);
  const hv = storyMode === "simple" ? (count(sn) && pos(st) && pos(sb) ? simpleStoryHeights(count(sn)!, pos(st)!, pos(sb)!) : null) : parseSpans(hs);
  const dims = (v: string) => {
    const m = /^\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*$/i.exec(v);
    return m && Number(m[1]) > 0 && Number(m[2]) > 0 ? { b: Number(m[1]) / 1000, h: Number(m[2]) / 1000 } : null;
  };
  const cv = dims(col);
  const bv = dims(beam);
  const sv = Number(slab) > 0 ? Number(slab) / 1000 : null;
  const needGrid = tpl !== "blank";
  const needBeam = needGrid && tpl !== "flatSlab";
  const flat = tpl === "flatSlab" || tpl === "flatSlabBeams";
  const step2Valid = !needGrid || (!!xv && !!yv && !!hv && !!cv && (!needBeam || !!bv) && !!sv);
  const valid = step1Valid && step2Valid;

  const create = async () => {
    if (!valid || !init || !(await confirmDiscardAsync())) return;
    const model =
      tpl === "blank"
        ? { ...emptyModel(name.trim(), init.units), designCodes: init.designCodes }
        : createRcFrameModel({
            name: name.trim(),
            xSpans: xv!,
            ySpans: yv!,
            storyHeights: hv!,
            column: cv!,
            beam: bv ?? { b: 0.3, h: 0.6 },
            slabThickness: sv!,
            concrete,
            objects: tpl,
            units: init.units,
            designCodes: init.designCodes,
          });
    if (saveDefault) save(SAVED_KEY, init);
    useModel.getState().reset(model, null);
    useUi.getState().log("success", T.log.newModel);
    if (flat) useUi.getState().log("warning", N.flatNote);
    useUi.getState().set({ zoomSeq: useUi.getState().zoomSeq + 1, zoomAll: true });
    onClose();
  };

  const err = (ok: unknown) => (ok ? undefined : "invalid");
  const spanInput = (value: string, set: (v: string) => void, parsed: number[] | null, testId: string) => (
    <input value={value} aria-invalid={!!err(parsed)} onChange={(e) => set(e.target.value)} onBlur={() => parsed && set(formatSpans(parsed))} data-testid={testId} />
  );
  const numInput = (value: string, set: (v: string) => void, ok: unknown, testId: string) => (
    <input value={value} aria-invalid={!!err(ok)} onChange={(e) => set(e.target.value)} data-testid={testId} />
  );
  const modeRadio = <V extends string>(current: V, value: V, set: (v: V) => void, label: string, testId: string, disabled = false) => (
    <label className="radio-row">
      <input type="radio" name={testId} checked={current === value} disabled={disabled} onChange={() => set(value)} data-testid={`${testId}-${value}`} /> {label}
    </label>
  );

  const pickFile = async () => {
    const r = await pickProjectModel();
    if (!r) return;
    setFromFile({ units: r.model.units, designCodes: nonEmpty(r.model.designCodes ?? {}), file: r.name });
    setMode("file");
  };

  return (
    <Modal
      title={`${N.title} — ${step === 1 ? N.step1 : N.step2}`}
      onClose={onClose}
      width={880}
      testId="dlg-newModel"
      footer={
        <>
          <div className="modal-error">
            {step === 2 && needGrid && xv && yv && hv
              ? T.fmt(N.summary, { x: xv.length, y: yv.length, n: hv.length, h: hv.reduce((a, b) => a + b, 0).toFixed(2) })
              : ""}
          </div>
          <button className="btn" onClick={onClose}>
            {T.dlg.cancel}
          </button>
          {step === 2 && (
            <button className="btn" onClick={() => setStep(1)} data-testid="new-back">
              {N.back}
            </button>
          )}
          {step === 1 ? (
            <button className="btn primary" disabled={!step1Valid} onClick={() => setStep(2)} data-testid="new-next">
              {N.next}
            </button>
          ) : (
            <button className="btn primary" disabled={!valid} onClick={create} data-testid="create-model">
              {N.create}
            </button>
          )}
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
                if (!(await confirmDiscardAsync())) return;
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
        {step === 1 ? (
          <div data-testid="new-step1">
            <Field label={T.dlg.name}>
              <input value={name} onChange={(e) => setName(e.target.value)} data-testid="new-name" />
            </Field>
            <div className="init-modes" role="radiogroup">
              {modeRadio(mode, "builtin", setMode, N.initBuiltin, "init")}
              {mode === "builtin" && (
                <div className="init-block">
                  <Field label={N.units}>
                    <select value={units} onChange={(e) => setUnits(e.target.value)} data-testid="new-units">
                      {UNIT_PRESETS.map((p) => (
                        <option key={p.label}>{p.label}</option>
                      ))}
                    </select>
                  </Field>
                  {(["concrete", "steel", "loads"] as const).map((k) => (
                    <Field key={k} label={T.codes[k]}>
                      <select value={codes[k]} aria-label={T.codes[k]} data-testid={`code-${k}`} onChange={(e) => setCodes((c) => ({ ...c, [k]: e.target.value }))}>
                        <option value="">{T.codes.none}</option>
                        {DESIGN_CODE_OPTIONS[k].map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </Field>
                  ))}
                  <p className="form-hint">{T.codes.note}</p>
                  <p className="form-hint">{N.steelDbNote}</p>
                </div>
              )}
              {modeRadio(mode, "saved", setMode, N.initSaved, "init", !saved)}
              {mode === "saved" && saved && (
                <p className="form-hint init-block" data-testid="init-saved-summary">
                  {unitsLabel(saved.units)}
                  {Object.values(saved.designCodes).length ? ` · ${Object.values(saved.designCodes).join(" · ")}` : ""}
                </p>
              )}
              {!saved && <p className="form-hint init-block">{N.noSaved}</p>}
              {modeRadio(mode, "file", setMode, N.initFile, "init")}
              {mode === "file" && (
                <div className="init-block">
                  <button className="btn small" onClick={pickFile} data-testid="init-pick-file">
                    <Icon name="open" size={12} /> {N.pickFile}
                  </button>
                  <p className="form-hint" data-testid="init-file-summary">
                    {fromFile ? T.fmt(N.fromFile, { name: fromFile.file, units: unitsLabel(fromFile.units) }) : N.noFilePicked}
                  </p>
                </div>
              )}
            </div>
            <label className="radio-row">
              <input type="checkbox" checked={saveDefault} onChange={(e) => setSaveDefault(e.target.checked)} data-testid="init-save-default" /> {N.saveAsDefault}
            </label>
          </div>
        ) : (
          <div data-testid="new-step2">
            <div className="template-cards" role="radiogroup" aria-label={N.template}>
              {(
                [
                  ["frame", N.tplFrame, N.tplFrameDesc, "view3d"],
                  ["flatSlab", N.tplFlat, N.tplFlatDesc, "slab"],
                  ["flatSlabBeams", N.tplFlatBeams, N.tplFlatBeamsDesc, "slab"],
                  ["grid", N.tplGrid, N.tplGridDesc, "grid"],
                  ["blank", N.tplBlank, N.tplBlankDesc, "new"],
                ] as const
              ).map(([k, title, desc, icon]) => (
                <button key={k} role="radio" aria-checked={tpl === k} className={`template-card${tpl === k ? " active" : ""}`} onClick={() => setTpl(k)} data-testid={`tpl-${k}`}>
                  <Icon name={icon} size={22} />
                  <strong>{title}</strong>
                  <span>{desc}</span>
                </button>
              ))}
            </div>
            {flat && <p className="form-hint" data-testid="flat-note">{N.flatNote}</p>}
            {needGrid && (
              <>
                <h4 className="form-subtitle">{N.gridMode}</h4>
                <div className="init-modes" role="radiogroup">
                  {modeRadio(gridMode, "uniform", setGridMode, N.gridUniform, "gridmode")}
                  {modeRadio(gridMode, "custom", setGridMode, N.gridCustom, "gridmode")}
                </div>
                {gridMode === "uniform" ? (
                  <>
                    <Field label={N.xCount}>{numInput(xn, setXn, count(xn), "new-xcount")}</Field>
                    <Field label={N.xSpacing}>{numInput(xw, setXw, pos(xw), "new-xspacing")}</Field>
                    <Field label={N.yCount}>{numInput(yn, setYn, count(yn), "new-ycount")}</Field>
                    <Field label={N.ySpacing}>{numInput(yw, setYw, pos(yw), "new-yspacing")}</Field>
                  </>
                ) : (
                  <>
                    <Field label={N.xSpans} hint={N.spansHint}>
                      {spanInput(xs, setXs, parseSpans(xs), "new-xs")}
                    </Field>
                    <Field label={N.ySpans}>{spanInput(ys, setYs, parseSpans(ys), "new-ys")}</Field>
                  </>
                )}
                <h4 className="form-subtitle">{N.storyMode}</h4>
                <div className="init-modes" role="radiogroup">
                  {modeRadio(storyMode, "simple", setStoryMode, N.storySimple, "storymode")}
                  {modeRadio(storyMode, "custom", setStoryMode, N.storyCustom, "storymode")}
                </div>
                {storyMode === "simple" ? (
                  <>
                    <Field label={N.storyCount}>{numInput(sn, setSn, count(sn), "new-scount")}</Field>
                    <Field label={N.storyTypical}>{numInput(st, setSt, pos(st), "new-stypical")}</Field>
                    <Field label={N.storyBottom}>{numInput(sb, setSb, pos(sb), "new-sbottom")}</Field>
                  </>
                ) : (
                  <Field label={N.stories}>{spanInput(hs, setHs, parseSpans(hs), "new-hs")}</Field>
                )}
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
                {needBeam && (
                  <Field label={N.beam}>
                    <input value={beam} aria-invalid={!!err(bv)} onChange={(e) => setBeam(e.target.value)} />
                  </Field>
                )}
                <Field label={N.slab}>
                  <input value={slab} aria-invalid={!!err(sv)} onChange={(e) => setSlab(e.target.value)} />
                </Field>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
