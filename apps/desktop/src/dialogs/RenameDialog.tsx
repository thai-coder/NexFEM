import { useState } from "react";
import { Field } from "../components/fields.tsx";
import { Modal } from "../components/Modal.tsx";
import { useT } from "../i18n/index.ts";
import { useModel } from "../stores/model.ts";

/** Đổi nhãn một nút / thanh / sàn; nhãn phải duy nhất trong cùng loại. */
export function RenameDialog({ id, onClose }: { id: string; onClose(): void }) {
  const T = useT();
  const model = useModel((s) => s.model);
  const found =
    (model.joints.find((o) => o.id === id) && ({ collection: "joints", obj: model.joints.find((o) => o.id === id)! } as const)) ||
    (model.frames.find((o) => o.id === id) && ({ collection: "frames", obj: model.frames.find((o) => o.id === id)! } as const)) ||
    (model.shells.find((o) => o.id === id) && ({ collection: "shells", obj: model.shells.find((o) => o.id === id)! } as const)) ||
    null;
  const [label, setLabel] = useState(found?.obj.label ?? "");
  const [error, setError] = useState<string | null>(null);
  if (!found) return null;
  const ok = () => {
    const r = useModel.getState().run("object.update", { collection: found.collection, id, patch: { label } }, T.rename.title);
    if (r.ok) onClose();
    else setError(r.error);
  };
  return (
    <Modal
      title={T.rename.title}
      onClose={onClose}
      width={420}
      testId="dlg-rename"
      footer={
        <>
          <div className={`modal-error${error ? " is-error" : ""}`} role="alert">
            {error ?? T.fmt(T.rename.object, { kind: found.collection === "joints" ? T.props.joint : found.collection === "frames" ? T.explorer.frames : T.explorer.shells, label: found.obj.label })}
          </div>
          <button className="btn" onClick={onClose}>
            {T.dlg.cancel}
          </button>
          <button className="btn primary" disabled={!label.trim()} onClick={ok} data-testid="dialog-ok">
            {T.dlg.ok}
          </button>
        </>
      }
    >
      <Field label={T.rename.label}>
        <input value={label} autoFocus data-testid="rename-input" onChange={(e) => (setLabel(e.target.value), setError(null))} onKeyDown={(e) => e.key === "Enter" && label.trim() && ok()} />
      </Field>
    </Modal>
  );
}
