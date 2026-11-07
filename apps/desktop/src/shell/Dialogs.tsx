import { COMMANDS } from "../commands/app.ts";
import { FrameSectionsDialog, LoadsDialog, MaterialsDialog, ShellSectionsDialog } from "../dialogs/DefinitionDialogs.tsx";
import { GridStoryDialog } from "../dialogs/GridStoryDialog.tsx";
import { NewModelDialog } from "../dialogs/NewModelDialog.tsx";
import { PreferencesDialog } from "../dialogs/PreferencesDialog.tsx";
import { RenameDialog } from "../dialogs/RenameDialog.tsx";
import { ReplicateDialog } from "../dialogs/ReplicateDialog.tsx";
import {
  AssignFrameLoadDialog,
  AssignReleasesDialog,
  AssignRestraintDialog,
  AssignSectionDialog,
  AssignShellLoadDialog,
} from "../dialogs/AssignDialogs.tsx";
import { useT } from "../i18n/index.ts";
import { useUi } from "../stores/ui.ts";

export const APP_VERSION = "0.1.0-alpha";

export function Dialogs() {
  const T = useT();
  const dialog = useUi((s) => s.dialog);
  const set = useUi((s) => s.set);
  if (!dialog) return null;
  const close = () => set({ dialog: null });
  switch (dialog.kind) {
    case "newModel":
      return <NewModelDialog onClose={close} />;
    case "gridStory":
      return <GridStoryDialog onClose={close} />;
    case "materials":
      return <MaterialsDialog onClose={close} />;
    case "frameSections":
      return <FrameSectionsDialog onClose={close} />;
    case "shellSections":
      return <ShellSectionsDialog onClose={close} />;
    case "loads":
      return <LoadsDialog onClose={close} {...(dialog.tab ? { tab: dialog.tab } : {})} />;
    case "preferences":
      return <PreferencesDialog onClose={close} />;
    case "replicate":
      return <ReplicateDialog onClose={close} />;
    case "rename":
      return dialog.id ? <RenameDialog id={dialog.id} onClose={close} /> : null;
    case "assignRestraint":
      return <AssignRestraintDialog onClose={close} />;
    case "assignSection":
      return <AssignSectionDialog onClose={close} />;
    case "assignReleases":
      return <AssignReleasesDialog onClose={close} />;
    case "assignFrameLoad":
      return <AssignFrameLoadDialog onClose={close} />;
    case "assignShellLoad":
      return <AssignShellLoadDialog onClose={close} />;
    default:
      break;
  }
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
