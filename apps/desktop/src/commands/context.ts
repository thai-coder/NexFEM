import type { GridHit } from "@nexfem/viewer";
import { t } from "../i18n/index.ts";
import { useModel } from "../stores/model.ts";
import { useUi, type MenuEntry } from "../stores/ui.ts";

/**
 * Dựng và mở menu chuột phải theo đối tượng đang chọn, trục lưới dưới con trỏ và công cụ hiện tại.
 * Mục là chuỗi thì là id lệnh (lấy nhãn, phím tắt, trạng thái từ danh sách lệnh).
 */
export function openContextMenu(x: number, y: number, opts: { grid?: GridHit | null; extra?: MenuEntry[] } = {}): void {
  const T = t();
  const ui = useUi.getState();
  const { model, selection, locked } = useModel.getState();
  const sel = new Set(selection);
  const n = {
    joints: model.joints.filter((o) => sel.has(o.id)).length,
    frames: model.frames.filter((o) => sel.has(o.id)).length,
    shells: model.shells.filter((o) => sel.has(o.id)).length,
  };
  const entries: MenuEntry[] = [];
  const sep = () => entries.length && entries.at(-1) !== "-" && entries.push("-");

  if (opts.extra?.length) entries.push(...opts.extra);
  if (selection.length) {
    sep();
    entries.push({ label: T.fmt(T.ctx.selected, { n: selection.length }), header: true });
    entries.push("ctx.info");
    if (selection.length === 1) entries.push("ctx.rename");
    sep();
    if (n.joints) entries.push("assign.restraint");
    if (n.frames) entries.push("assign.section", "assign.releases", "assign.frameLoad");
    if (n.shells) entries.push("assign.shellLoad");
    sep();
    entries.push("edit.replicate", "edit.delete");
  }
  if (opts.grid) {
    sep();
    entries.push({ label: T.fmt(opts.grid.kind === "story" ? T.ctx.storyLine : T.ctx.gridLine, { label: opts.grid.label }), header: true }, "ctx.editGrid");
  }
  sep();
  entries.push("view.zoomExtents", "edit.selectAll");
  if (selection.length) entries.push("select.clear");
  if (ui.tool !== "select") entries.push("draw.select");
  void locked;
  ui.set({ contextMenu: { x, y, entries } });
}
