import { CommandError, CommandStack, emptyModel, sampleModel, type Model } from "@nexfem/model-core";
import { create } from "zustand";
import { t } from "../i18n/index.ts";
import { useResults } from "./results.ts";
import { defaultViewsFor, useUi } from "./ui.ts";

export type SelectMode = "replace" | "toggle" | "add";

interface ModelState {
  model: Model;
  /** Đường dẫn file đang mở (bản desktop) hoặc tên file (bản trình duyệt). */
  fileName: string | null;
  dirty: boolean;
  locked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoTitle?: string;
  redoTitle?: string;
  selection: string[];

  /** Chạy lệnh qua command registry. Trả về kết quả của lệnh, hoặc undefined nếu lỗi (đã ghi log). */
  execute(name: string, args: unknown, source?: string): unknown;
  /** Chạy nhiều lệnh thành một bước Undo. Trả về thông báo lỗi nếu có (mô hình giữ nguyên). */
  executeBatch(title: string, ops: { name: string; args: unknown }[], source?: string): string | null;
  /** Chạy một lệnh, trả về kết quả hoặc thông báo lỗi (để hiện ngay trong hộp thoại). */
  run(name: string, args: unknown, title?: string): { ok: true; result: unknown } | { ok: false; error: string };
  /** Đánh dấu đã lưu. */
  markSaved(fileName: string): void;
  undo(): void;
  redo(): void;
  select(ids: string[], mode?: SelectMode): void;
  reset(model: Model, fileName?: string | null): void;
}

/**
 * Mô hình lúc mở app: mô hình trống (như ETABS khi chưa mở file). Mô hình mẫu mở bằng
 * Trang chủ ▸ Mở mô hình mẫu hoặc File ▸ Mở mô hình mẫu. Địa chỉ có `?sample` (kiểm thử e2e) thì nạp sẵn mô hình mẫu.
 */
export function startupModel(): Model {
  const wantsSample = typeof location !== "undefined" && new URLSearchParams(location.search).has("sample");
  return wantsSample ? sampleModel() : emptyModel(t().app.untitled);
}

const stack = new CommandStack(startupModel());

function snapshot() {
  return {
    model: stack.model,
    canUndo: stack.canUndo,
    canRedo: stack.canRedo,
    undoTitle: stack.undoTitle,
    redoTitle: stack.redoTitle,
  };
}

export const useModel = create<ModelState>((set, get) => ({
  ...snapshot(),
  fileName: null,
  dirty: false,
  locked: false,
  selection: [],

  execute(name, args, source = "ui") {
    const log = useUi.getState().log;
    if (get().locked) {
      log("warning", t().props.locked, source);
      return undefined;
    }
    try {
      const r = stack.execute(name, args);
      if (r.changed) {
        const ids = new Set(objectIds(stack.model));
        set({ ...snapshot(), dirty: true, selection: get().selection.filter((id) => ids.has(id)) });
        log("command", t().fmt(t().log.executed, { title: stack.undoTitle ?? name }), source);
      }
      return r.result;
    } catch (e) {
      const message = e instanceof CommandError || e instanceof Error ? e.message : String(e);
      log("error", t().fmt(t().log.failed, { message }), source);
      return undefined;
    }
  },

  executeBatch(title, ops, source = "ui") {
    const log = useUi.getState().log;
    if (get().locked) return t().props.locked;
    if (!ops.length) return null;
    try {
      const r = stack.executeBatch(title, ops);
      if (r.changed) {
        const ids = new Set(objectIds(stack.model));
        set({ ...snapshot(), dirty: true, selection: get().selection.filter((id) => ids.has(id)) });
        log("command", title, source);
      }
      return null;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log("error", t().fmt(t().log.failed, { message }), source);
      return message;
    }
  },

  run(name, args, title) {
    const log = useUi.getState().log;
    if (get().locked) return { ok: false, error: t().props.locked };
    try {
      const r = stack.executeBatch(title ?? name, [{ name, args }]);
      if (r.changed) {
        const ids = new Set(objectIds(stack.model));
        set({ ...snapshot(), dirty: true, selection: get().selection.filter((id) => ids.has(id)) });
        log("command", title ?? name);
      }
      return { ok: true, result: r.results[0] };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      log("error", t().fmt(t().log.failed, { message: error }));
      return { ok: false, error };
    }
  },

  markSaved(fileName) {
    set({ fileName, dirty: false });
  },

  undo() {
    const title = stack.undoTitle;
    if (get().locked || !stack.undo()) return;
    set({ ...snapshot(), dirty: true });
    useUi.getState().log("info", t().fmt(t().log.undo, { title: title ?? "" }));
  },

  redo() {
    const title = stack.redoTitle;
    if (get().locked || !stack.redo()) return;
    set({ ...snapshot(), dirty: true });
    useUi.getState().log("info", t().fmt(t().log.redo, { title: title ?? "" }));
  },

  select(ids, mode = "replace") {
    const cur = get().selection;
    if (mode === "replace") return set({ selection: [...new Set(ids)] });
    const s = new Set(cur);
    if (mode === "add") ids.forEach((id) => s.add(id));
    else ids.forEach((id) => (s.has(id) ? s.delete(id) : s.add(id)));
    set({ selection: [...s] });
  },

  reset(model, fileName = null) {
    stack.reset(model);
    // Chỉ mở mô hình từ file đã lưu mới được xem là "clean"; mô hình mới phải được Save lần đầu.
    set({ ...snapshot(), fileName, dirty: fileName === null, locked: false, selection: [] });
    useResults.getState().clear();
    useUi.getState().set({ messages: null, views: defaultViewsFor(model), hover: null });
  },
}));

function objectIds(m: Model): string[] {
  return [...m.joints, ...m.frames, ...m.shells, ...m.materials, ...m.frameSections, ...m.shellSections].map((o) => o.id);
}

// Khung nhìn ban đầu theo mô hình lúc mở app (mô hình trống thì cả bốn ô là 3D).
useUi.getState().set({ views: defaultViewsFor(stack.model) });

/** Truy cập ngăn xếp lệnh (cho kiểm thử, API sau này). */
export function commandStack(): CommandStack {
  return stack;
}
