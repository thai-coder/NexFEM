import { PROJECT_EXTENSION, parseProject, serializeProject } from "@nexfem/model-core";
import { t } from "../i18n/index.ts";
import { useModel } from "../stores/model.ts";
import { load, save } from "../stores/persist.ts";
import { useUi } from "../stores/ui.ts";
import { isTauri } from "./tauri.ts";

/** Mở và lưu file dự án `.nxf`. Bản desktop dùng hộp thoại hệ điều hành; bản trình duyệt dùng tải lên/tải xuống. */

export interface RecentFile {
  path: string;
  name: string;
  openedAt: string;
}

const RECENT_KEY = "recent-files";

export function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function recentFiles(): RecentFile[] {
  return load<RecentFile[]>(RECENT_KEY, []);
}

function pushRecent(path: string) {
  if (!isTauri()) return;
  const list = recentFiles().filter((r) => r.path !== path);
  list.unshift({ path, name: basename(path), openedAt: new Date().toISOString() });
  save(RECENT_KEY, list.slice(0, 10));
}

/** Hỏi trước khi bỏ thay đổi chưa lưu. */
export function confirmDiscard(): boolean {
  return !useModel.getState().dirty || window.confirm(t().file.confirmDiscard);
}

function loadBytes(bytes: Uint8Array, path: string) {
  const { model } = parseProject(bytes);
  useModel.getState().reset(model, path);
  pushRecent(path);
  useUi.getState().log("success", t().fmt(t().file.opened, { name: basename(path) }));
  useUi.getState().set({ zoomSeq: useUi.getState().zoomSeq + 1 });
}

function fail(kind: "openFailed" | "saveFailed", e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  useUi.getState().log("error", t().fmt(t().file[kind], { message }));
}

async function tauri() {
  const [{ invoke }, dialog] = await Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/plugin-dialog")]);
  return { invoke, dialog };
}

const filters = () => [{ name: t().file.filterName, extensions: [PROJECT_EXTENSION, "json"] }];

/** Mở file theo đường dẫn (danh sách gần đây, bản desktop). */
export async function openPath(path: string): Promise<boolean> {
  try {
    const { invoke } = await tauri();
    const data = await invoke<number[]>("read_project_file", { path });
    loadBytes(new Uint8Array(data), path);
    return true;
  } catch (e) {
    fail("openFailed", e);
    save(RECENT_KEY, recentFiles().filter((r) => r.path !== path));
    return false;
  }
}

export async function openProject(): Promise<boolean> {
  if (!confirmDiscard()) return false;
  if (isTauri()) {
    const { dialog } = await tauri();
    const path = await dialog.open({ multiple: false, directory: false, filters: filters() });
    if (typeof path !== "string") return false;
    return openPath(path);
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `.${PROJECT_EXTENSION},.json`;
    input.style.display = "none";
    input.dataset.testid = "open-input";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(false);
      try {
        loadBytes(new Uint8Array(await file.arrayBuffer()), file.name);
        resolve(true);
      } catch (e) {
        fail("openFailed", e);
        resolve(false);
      }
    });
    document.body.appendChild(input);
    input.click();
  });
}

export async function saveProject(saveAs = false): Promise<boolean> {
  const { model, fileName } = useModel.getState();
  const bytes = serializeProject(model);
  const suggested = `${model.name || "model"}.${PROJECT_EXTENSION}`;
  try {
    if (isTauri()) {
      const { invoke, dialog } = await tauri();
      let path = fileName && /[\\/]/.test(fileName) ? fileName : null;
      if (!path || saveAs) {
        const chosen = await dialog.save({ defaultPath: path ?? suggested, filters: filters() });
        if (!chosen) return false;
        path = chosen.toLowerCase().endsWith(`.${PROJECT_EXTENSION}`) ? chosen : `${chosen}.${PROJECT_EXTENSION}`;
      }
      await invoke("write_project_file", { path, data: Array.from(bytes) });
      useModel.getState().markSaved(path);
      pushRecent(path);
      useUi.getState().log("success", t().fmt(t().file.saved, { name: basename(path) }));
      return true;
    }
    const name = fileName && !saveAs ? basename(fileName) : suggested;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    useModel.getState().markSaved(name);
    useUi.getState().log("success", t().fmt(t().file.downloaded, { name }));
    return true;
  } catch (e) {
    fail("saveFailed", e);
    return false;
  }
}
