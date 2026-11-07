import { DESIGN_CODE_OPTIONS, UNIT_PRESETS, unitsLabel } from "@nexfem/model-core";
import { Field } from "../components/fields.tsx";
import { Modal } from "../components/Modal.tsx";
import { useT } from "../i18n/index.ts";
import { useModel } from "../stores/model.ts";
import { useUi } from "../stores/ui.ts";

export function PreferencesDialog({ onClose }: { onClose(): void }) {
  const T = useT();
  const P = T.dlg.prefs;
  const lang = useUi((s) => s.lang);
  const theme = useUi((s) => s.theme);
  const units = useModel((s) => s.model.units);
  const execute = useModel((s) => s.execute);
  const designCodes = useModel((s) => s.model.designCodes);
  return (
    <Modal
      title={P.title}
      onClose={onClose}
      width={480}
      testId="dlg-preferences"
      footer={
        <button className="btn primary" onClick={onClose}>
          {T.dlg.ok}
        </button>
      }
    >
      <Field label={P.language}>
        <select value={lang} onChange={(e) => useUi.getState().setLang(e.target.value as "vi" | "en")}>
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>
      </Field>
      <Field label={P.theme}>
        <select value={theme} onChange={(e) => useUi.getState().setTheme(e.target.value as "dark" | "light")}>
          <option value="dark">{P.dark}</option>
          <option value="light">{P.light}</option>
        </select>
      </Field>
      <Field label={P.units}>
        <select
          value={unitsLabel(units)}
          onChange={(e) => {
            const p = UNIT_PRESETS.find((x) => x.label === e.target.value);
            if (p) execute("model.setUnits", { units: p.units });
          }}
        >
          {UNIT_PRESETS.map((p) => (
            <option key={p.label}>{p.label}</option>
          ))}
        </select>
      </Field>
      <h4 className="form-subtitle">{T.codes.title}</h4>
      {(["concrete", "steel", "loads"] as const).map((k) => (
        <Field key={k} label={T.codes[k]}>
          <select value={designCodes[k] ?? ""} aria-label={T.codes[k]} onChange={(e) => execute("model.setDesignCodes", { [k]: e.target.value })}>
            <option value="">{T.codes.none}</option>
            {DESIGN_CODE_OPTIONS[k].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </Field>
      ))}
      <p className="form-hint">{T.codes.note}</p>
      <Field label={P.layout}>
        <button className="btn small" onClick={() => window.dispatchEvent(new CustomEvent("nexfem:reset-layout"))}>
          {T.cmd["view.resetLayout"]}
        </button>
      </Field>
    </Modal>
  );
}
