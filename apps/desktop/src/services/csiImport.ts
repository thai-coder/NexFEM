import { importCsiFile, type CsiExpected, type CsiImportResult } from "@nexfem/io-formats";
import { t } from "../i18n/index.ts";
import { useCsiImport } from "../stores/csiImport.ts";
import { useModel } from "../stores/model.ts";
import { csiImportPolicy } from "./csiImportPolicy.ts";
import { useUi } from "../stores/ui.ts";

/** Đuôi file cho hộp chọn file của từng mục trong menu "Nhập file". File nhị phân (.edb, .sdb) vẫn chọn được để báo cách xuất file văn bản. */
const ACCEPT: Record<CsiExpected, string> = {
  e2k: ".e2k,.E2K,.$et,.$ET,.edb,.EDB",
  s2k: ".s2k,.S2K,.$2k,.$2K,.2k,.2K,.sdb,.SDB",
};

/**
 * Chọn file CSI (hộp chọn file của WebView, dùng được cả bản desktop), nhập và mở báo cáo nhập.
 * Mỗi chương trình là một mục riêng trong menu; định dạng thật vẫn nhận theo nội dung file.
 */
export function importCsiFromPicker(expected: CsiExpected): Promise<boolean> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT[expected];
    input.style.display = "none";
    input.dataset.testid = `import-${expected}-input`;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(false);
      try {
        const result = importCsiFile(new Uint8Array(await file.arrayBuffer()), expected);
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

/**
 * Đường duy nhất đưa mô hình nhập từ CSI vào mô hình phân tích. Kiểm tra lại chính sách tại đây (không chỉ ở nút bấm),
 * để mọi nơi gọi đều không mở được kết quả nhập bị chặn (`report.blocked`) hay file không đọc được đơn vị.
 */
export function openCsiImport(result: CsiImportResult): boolean {
  if (!csiImportPolicy(result).canOpen) {
    useUi.getState().log("error", t().csi.importBlocked);
    return false;
  }
  useModel.getState().reset(result.model, null);
  return true;
}
