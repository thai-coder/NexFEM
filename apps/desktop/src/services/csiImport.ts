import { decodeE2k, importE2k } from "@nexfem/io-formats";
import { t } from "../i18n/index.ts";
import { useCsiImport } from "../stores/csiImport.ts";
import { useUi } from "../stores/ui.ts";

/** Chọn file ETABS `.e2k` (hộp chọn file của WebView, dùng được cả bản desktop), nhập và mở báo cáo nhập. */
export function importEtabsFile(): Promise<boolean> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".e2k,.E2K,.$et,.$ET";
    input.style.display = "none";
    input.dataset.testid = "e2k-input";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(false);
      try {
        const text = decodeE2k(new Uint8Array(await file.arrayBuffer()));
        const result = importE2k(text);
        useCsiImport.getState().set(file.name, result);
        useUi.getState().set({ dialog: { kind: "csiImport" } });
        resolve(true);
      } catch (e) {
        useUi.getState().log("error", t().fmt(t().csi.failed, { message: e instanceof Error ? e.message : String(e) }));
        resolve(false);
      }
    });
    document.body.appendChild(input);
    input.click();
  });
}
