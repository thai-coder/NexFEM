import { DEFAULT_DISPLAY, viewTitle, type DisplayOptions } from "@nexfem/viewer";
import { useState } from "react";
import { Modal } from "../components/Modal.tsx";
import { useT } from "../i18n/index.ts";
import { useModel } from "../stores/model.ts";
import { useUi } from "../stores/ui.ts";

type Key = keyof DisplayOptions;

const GROUPS: { id: "objects" | "labels" | "assignments" | "other"; keys: Key[] }[] = [
  { id: "objects", keys: ["joints", "beams", "columns", "braces", "slabs", "walls"] },
  { id: "labels", keys: ["jointLabels", "frameLabels", "sectionNames", "shellLabels"] },
  { id: "assignments", keys: ["restraints", "releases", "loads"] },
  { id: "other", keys: ["grid", "fillShells"] },
];

/**
 * Set View Options: tuỳ chọn hiển thị riêng cho một cửa sổ khung nhìn,
 * có ô "Áp dụng cho tất cả cửa sổ" như ETABS/SAP2000.
 */
export function ViewOptionsDialog({ pane, onClose }: { pane: number; onClose(): void }) {
  const T = useT();
  const V = T.dlg.viewOptions;
  const model = useModel((s) => s.model);
  const view = useUi((s) => s.views[pane]) ?? { kind: "3d" as const };
  const [draft, setDraft] = useState<DisplayOptions>(() => ({ ...useUi.getState().viewDisplay[pane]! }));
  const [all, setAll] = useState(false);
  const title = viewTitle(model, view, { plan: T.view.plan, elevation: T.view.elevation, view3d: T.view.view3d, axis: T.view.axis });

  const apply = () => useUi.getState().setViewDisplay(all ? "all" : pane, draft);

  return (
    <Modal
      title={`${V.title} — ${title}`}
      onClose={onClose}
      width={560}
      testId="dlg-viewOptions"
      footer={
        <>
          <label className="radio-row modal-error">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} data-testid="view-apply-all" /> {V.applyAll}
          </label>
          <button className="btn" onClick={() => setDraft({ ...DEFAULT_DISPLAY })} data-testid="view-reset">
            {V.reset}
          </button>
          <button className="btn" onClick={onClose}>
            {T.dlg.cancel}
          </button>
          <button className="btn" onClick={apply} data-testid="dialog-apply">
            {T.dlg.apply}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              apply();
              onClose();
            }}
            data-testid="dialog-ok"
          >
            {T.dlg.ok}
          </button>
        </>
      }
    >
      <div className="view-options">
        {GROUPS.map((g) => (
          <fieldset key={g.id} className="view-options-group">
            <legend>{V[g.id]}</legend>
            {g.keys.map((k) => (
              <label key={k} className="radio-row">
                <input type="checkbox" checked={draft[k]} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.checked }))} data-testid={`vo-${k}`} /> {V[k]}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <p className="form-hint">{V.hint}</p>
    </Modal>
  );
}
