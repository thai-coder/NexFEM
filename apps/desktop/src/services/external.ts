import { t } from "../i18n/index.ts";
import { useUi } from "../stores/ui.ts";
import { isTauri } from "./tauri.ts";

/** Mở liên kết ngoài bằng trình duyệt hệ thống; nếu không được thì ghi địa chỉ vào nhật ký. */
export async function openExternal(url: string): Promise<void> {
  try {
    if (isTauri()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } catch {
    useUi.getState().log("warning", t().fmt(t().start.openFailed, { url }));
  }
}
