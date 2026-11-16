import { useState } from "react";
import { Modal } from "../components/Modal.tsx";
import { useT } from "../i18n/index.ts";
import { closeProject, saveProject } from "../services/files.ts";
import { useModel } from "../stores/model.ts";

export function CloseModelDialog({ onClose }: { onClose(): void }) {
  const T = useT();
  const [saving, setSaving] = useState(false);
  const [incomplete, setIncomplete] = useState(false);
  const saveAndClose = async () => {
    const { model } = useModel.getState();
    setSaving(true);
    setIncomplete(false);
    if (await saveProject()) {
      if (useModel.getState().model === model) closeProject();
      else onClose();
    } else {
      setSaving(false);
      setIncomplete(true);
    }
  };

  return (
    <Modal title={T.cmd["file.close"]} onClose={() => { if (!saving) onClose(); }} width={460}
      footer={<>
        <button type="button" className="btn" disabled={saving} onClick={onClose}>{T.dlg.cancel}</button>
        <button type="button" className="btn" disabled={saving} onClick={closeProject}>{T.file.closeDiscard}</button>
        <button type="button" className="btn primary" disabled={saving} onClick={() => void saveAndClose()}>{T.file.closeSave}</button>
      </>}
    >
      <p>{T.file.closePrompt}</p>
      {incomplete && <p role="status">{T.file.closeSaveIncomplete}</p>}
    </Modal>
  );
}
