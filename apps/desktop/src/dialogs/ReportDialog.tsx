import { buildReport, reportToCsv, type ReportKind } from "@nexfem/model-core";
import { useMemo } from "react";
import { Modal } from "../components/Modal.tsx";
import { useT } from "../i18n/index.ts";
import { saveCsv } from "../services/exportText.ts";
import { useModel } from "../stores/model.ts";

/** Một báo cáo mô hình dạng bảng, có xuất CSV và sao chép. */
export function ReportDialog({ kind, onClose }: { kind: ReportKind; onClose(): void }) {
  const T = useT();
  const model = useModel((s) => s.model);
  const report = useMemo(() => buildReport(model, kind, T.reports.cols), [model, kind, T]);
  const title = T.reports.kinds[kind];
  const csv = () => reportToCsv(report);
  return (
    <Modal
      title={`${T.reports.title} — ${title}`}
      onClose={onClose}
      width={900}
      testId="dlg-report"
      footer={
        <>
          <div className="modal-error">{T.fmt(T.reports.rows, { n: report.rows.length })}</div>
          <button className="btn" data-testid="report-copy" onClick={() => void navigator.clipboard?.writeText(csv().replace(/^\uFEFF/, ""))}>
            {T.reports.copy}
          </button>
          <button className="btn" data-testid="report-csv" onClick={() => void saveCsv(`${model.name}-${kind}.csv`, csv())}>
            {T.reports.exportCsv}
          </button>
          <button className="btn primary" onClick={onClose} data-testid="dialog-ok">
            {T.dlg.ok}
          </button>
        </>
      }
    >
      <div className="report-scroll">
        <table className="report-table" data-testid="report-table">
          <thead>
            <tr>
              {report.columns.map((c) => (
                <th key={c.key} className={c.align === "left" ? "left" : ""}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r, i) => (
              <tr key={i}>
                {report.columns.map((c) => (
                  <td key={c.key} className={c.align === "left" ? "left" : ""}>
                    {r[c.key] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
