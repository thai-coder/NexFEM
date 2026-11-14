import { t } from "../i18n/index.ts";
import { useUi } from "../stores/ui.ts";
import { isTauri } from "./tauri.ts";

/** Lưu báo cáo CSV: bản desktop mở hộp thoại lưu của hệ điều hành; bản trình duyệt tải xuống. Trả về true nếu đã lưu. */
export async function saveCsv(suggestedName: string, text: string): Promise<boolean> {
  try {
    if (isTauri()) {
      const [{ invoke }, dialog] = await Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/plugin-dialog")]);
      const chosen = await dialog.save({ defaultPath: suggestedName, filters: [{ name: "CSV", extensions: ["csv"] }] });
      if (!chosen) return false;
      const path = chosen.toLowerCase().endsWith(".csv") ? chosen : `${chosen}.csv`;
      await invoke("write_report_file", { path, text });
      useUi.getState().log("success", t().fmt(t().reports.saved, { name: path.split(/[\\/]/).pop() ?? path }));
      return true;
    }
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    useUi.getState().log("success", t().fmt(t().reports.downloaded, { name: suggestedName }));
    return true;
  } catch (e) {
    useUi.getState().log("error", t().fmt(t().reports.failed, { message: e instanceof Error ? e.message : String(e) }));
    return false;
  }
}
