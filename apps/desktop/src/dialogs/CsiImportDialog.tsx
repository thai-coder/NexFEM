import type { ImportDiagnostic, ImportLevel } from "@nexfem/io-formats";
import { useState } from "react";
import { Modal } from "../components/Modal.tsx";
import { useT, type T as Strings } from "../i18n/index.ts";
import { confirmDiscardAsync } from "../services/files.ts";
import { useCsiImport } from "../stores/csiImport.ts";
import { useModel } from "../stores/model.ts";
import { useUi } from "../stores/ui.ts";

/** Nội dung một thông báo nhập theo ngôn ngữ giao diện; mã chưa dịch thì hiện nguyên mã và tham số. */
export function csiMessage(T: Strings, d: Pick<ImportDiagnostic, "code" | "params">): string {
  const tpl = (T.csi.codes as Record<string, string>)[d.code];
  return tpl ? T.fmt(tpl, d.params) : `${d.code} ${JSON.stringify(d.params)}`;
}

const LEVELS: ImportLevel[] = ["error", "warning", "info"];

/** Báo cáo nhập ETABS: số lượng, các thứ không nhập được / gần đúng, rồi mới cho mở mô hình. */
export function CsiImportDialog({ onClose }: { onClose(): void }) {
  const T = useT();
  const C = T.csi;
  const { fileName, result, clear } = useCsiImport();
  const [open, setOpen] = useState<Record<string, boolean>>({ error: true, warning: true, info: false });
  if (!result) return null;
  const { model, report } = result;
  // Chỉ mở được khi là file ETABS đọc được đơn vị; .s2k và định dạng lạ chỉ xem báo cáo.
  const canOpen = result.format === "e2k" && report.units !== null;
  const close = () => {
    clear();
    onClose();
  };
  const textReport = () =>
    [
      T.fmt(C.source, { file: fileName ?? "", program: report.program, version: report.version, units: report.units ? `${report.units.force}, ${report.units.length}` : "?" }),
      ...Object.entries(report.counts).map(([k, v]) => `${(C.kinds as Record<string, string>)[k] ?? k}: ${v.source} → ${v.imported}`),
      ...report.diagnostics.map((d) => `[${d.level}] ×${d.count} ${csiMessage(T, d)}${d.objects.length ? ` — ${d.objects.join(", ")}` : ""}`),
    ].join("\n");
  return (
    <Modal
      title={`${C.title} — ${fileName ?? ""}`}
      onClose={close}
      width={860}
      testId="dlg-csiImport"
      footer={
        <>
          <div className="modal-error">{canOpen ? C.notEquivalent : C.nothingToOpen}</div>
          <button className="btn" onClick={() => void navigator.clipboard?.writeText(textReport())} data-testid="csi-copy">
            {C.copy}
          </button>
          <button className="btn" onClick={close}>
            {T.dlg.cancel}
          </button>
          <button
            className="btn primary"
            disabled={!canOpen}
            data-testid="csi-open"
            onClick={async () => {
              if (!(await confirmDiscardAsync())) return;
              useModel.getState().reset(model, null);
              useUi.getState().log("success", T.fmt(C.opened, { file: fileName ?? "", joints: model.joints.length, frames: model.frames.length, shells: model.shells.length }));
              useUi.getState().set({ zoomSeq: useUi.getState().zoomSeq + 1, zoomAll: true });
              close();
            }}
          >
            {C.open}
          </button>
        </>
      }
    >
      <p className="form-hint" data-testid="csi-source">
        {T.fmt(C.source, { file: fileName ?? "", program: report.program || "?", version: report.version || "?", units: report.units ? `${report.units.force}, ${report.units.length}` : "?" })}. {C.unitsNote}
      </p>
      <div className="csi-import">
        <table className="report-table csi-counts" data-testid="csi-counts">
          <thead>
            <tr>
              <th className="left">{C.colKind}</th>
              <th>{C.colSource}</th>
              <th>{C.colImported}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(report.counts).map(([k, v]) => (
              <tr key={k} className={v.imported < v.source && k !== "joints" ? "short" : ""}>
                <td className="left">{(C.kinds as Record<string, string>)[k] ?? k}</td>
                <td>{v.source}</td>
                <td>{v.imported}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="csi-diags">
          {LEVELS.map((level) => {
            const list = report.diagnostics.filter((d) => d.level === level);
            if (!list.length) return null;
            return (
              <details key={level} open={open[level]} onToggle={(e) => setOpen((o) => ({ ...o, [level]: (e.target as HTMLDetailsElement).open }))} className={`csi-level ${level}`} data-testid={`csi-${level}`}>
                <summary>
                  {C.levels[level]} ({list.reduce((s, d) => s + d.count, 0)})
                </summary>
                <ul>
                  {list.map((d) => (
                    <li key={`${d.code}-${JSON.stringify(d.params)}`}>
                      <span className="csi-count">{T.fmt(C.times, { n: d.count })}</span> {csiMessage(T, d)}
                      {d.objects.length > 0 && <div className="csi-objects">{T.fmt(C.objects, { list: d.objects.join(", ") + (d.count > d.objects.length ? " …" : "") })}</div>}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
