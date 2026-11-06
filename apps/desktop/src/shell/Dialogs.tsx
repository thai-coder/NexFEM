import { COMMANDS } from "../commands/app.ts";
import { useT } from "../i18n/index.ts";
import { useUi } from "../stores/ui.ts";

export const APP_VERSION = "0.1.0-alpha";

export function Dialogs() {
  const T = useT();
  const dialog = useUi((s) => s.dialog);
  const set = useUi((s) => s.set);
  if (!dialog) return null;
  const close = () => set({ dialog: null });
  return (
    <div className="overlay" onMouseDown={close} onKeyDown={(e) => e.key === "Escape" && close()}>
      <div className="dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        {dialog.kind === "about" ? (
          <>
            <h2>NexFEM</h2>
            <p>{T.fmt(T.about, { version: APP_VERSION })}</p>
          </>
        ) : (
          <>
            <h2>{T.shortcuts}</h2>
            <table className="shortcut-table">
              <tbody>
                {COMMANDS.filter((c) => c.shortcut).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <kbd>{c.shortcut}</kbd>
                    </td>
                    <td>{T.cmd[c.id]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="dialog-actions">
          <button className="btn primary" autoFocus onClick={close}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
