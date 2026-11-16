import { useT } from "../i18n/index.ts";
import { openExternal } from "../services/external.ts";
import { useUi } from "../stores/ui.ts";

const ETABS_DOCS = "https://docs.csiamerica.com/help-files/etabs/Menus/Help/Documentation.htm";
const SAP2000_DOCS = "https://docs.csiamerica.com/help-files/sap/Menus/Help/Documentation.htm";
const VALIDATION_PLAN = "https://github.com/thai-coder/NexFEM/blob/main/docs/CSI_IMPORT_VALIDATION_PLAN.md";

export function HelpDialog({ page, onClose }: { page: "helpGuide" | "documentation"; onClose(): void }) {
  const T = useT();
  const set = useUi((s) => s.set);
  const guide = page === "helpGuide";
  return (
    <div className="overlay" onMouseDown={onClose} onKeyDown={(event) => event.key === "Escape" && onClose()}>
      <div className="dialog help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="help-dialog-title">{guide ? T.cmd["help.guide"] : T.help.documentation}</h2>
        {guide ? (
          <>
            <ol>
              {T.help.guideSteps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <button className="btn" onClick={() => set({ dialog: { kind: "documentation" } })}>{T.help.documentation}</button>
          </>
        ) : (
          <>
            <h3>{T.help.vendorReferences}</h3>
            <p>{T.help.vendorScope}</p>
            <ul>
              <li><button className="btn" onClick={() => void openExternal(ETABS_DOCS)}>{T.help.etabs}</button></li>
              <li><button className="btn" onClick={() => void openExternal(SAP2000_DOCS)}>{T.help.sap2000}</button></li>
              <li><button className="btn" onClick={() => void openExternal(VALIDATION_PLAN)}>{T.help.validation}</button></li>
            </ul>
          </>
        )}
        <div className="dialog-actions">
          <button className="btn primary" autoFocus onClick={onClose}>{T.dlg.ok}</button>
        </div>
      </div>
    </div>
  );
}
