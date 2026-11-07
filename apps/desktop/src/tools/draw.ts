import {
  columnOps,
  planLineOps,
  slabOps,
  storiesForScope,
  storyAt,
  wallOps,
  type Model,
  type Op,
} from "@nexfem/model-core";
import type { P3, SnapPoint, ViewSpec } from "@nexfem/viewer";
import { t } from "../i18n/index.ts";
import { useModel } from "../stores/model.ts";
import { useUi, type Tool } from "../stores/ui.ts";

/** Công cụ vẽ: nhận điểm từ khung nhìn, tạo lệnh theo công cụ, khung nhìn và phạm vi tầng. */

type DrawTool = Exclude<Tool, "select">;
const EPS = 1e-6;

const same = (a: P3, b: P3) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS && Math.abs(a[2] - b[2]) < EPS;
const xy = (p: P3): [number, number] => [p[0], p[1]];

/** Tiết diện sẽ dùng cho công cụ (đã chọn trong panel, hoặc đoán theo tên). */
export function drawSection(model: Model, tool: DrawTool): string | undefined {
  if (tool === "joint") return undefined;
  const chosen = useUi.getState().drawSections[tool];
  if (tool === "slab" || tool === "wall") {
    const list = model.shellSections.filter((s) => s.kind === tool);
    if (chosen && list.some((s) => s.id === chosen)) return chosen;
    return list[0]?.id;
  }
  if (chosen && model.frameSections.some((s) => s.id === chosen)) return chosen;
  const prefix = tool === "column" ? /^C/i : /^(D|B)/i;
  return (model.frameSections.find((s) => prefix.test(s.name)) ?? model.frameSections[0])?.id;
}

/** Công cụ này có vẽ được trên khung nhìn này không. */
export function canDrawIn(view: ViewSpec | undefined): boolean {
  return !!view && view.kind !== "3d";
}

/** Đa giác (sàn; vách ở mặt đứng) thì cần nhiều điểm rồi đóng lại. */
export function isPolygonTool(tool: Tool, view: ViewSpec | undefined): boolean {
  return tool === "slab" || (tool === "wall" && view?.kind === "elevation");
}

function commit(title: string, ops: Op[]): boolean {
  if (!ops.length) return false;
  return useModel.getState().executeBatch(title, ops) === null;
}

function setPoints(drawPoints: P3[], drawPane?: number) {
  useUi.getState().set(drawPane === undefined ? { drawPoints } : { drawPoints, drawPane });
}

/** Xử lý một lần bấm điểm trong ô viewport `pane`. */
export function handlePoint(pane: number, snap: SnapPoint): void {
  const ui = useUi.getState();
  const tool = ui.tool;
  if (tool === "select") return;
  const view = ui.views[pane];
  if (!canDrawIn(view) || !view) {
    ui.log("info", t().draw.not3d);
    return;
  }
  const model = useModel.getState().model;
  const p = snap.p;
  // Chuyển ô khác thì bắt đầu chuỗi mới.
  let pts = ui.drawPane === pane ? ui.drawPoints : [];
  const last = pts.at(-1);
  if (last && same(last, p)) return; // bấm đúp tạo 2 điểm trùng
  const section = drawSection(model, tool);
  if (tool !== "joint" && !section) {
    ui.log("warning", t().draw.noSection);
    return;
  }
  const title = t().cmd[`draw.${tool}`];
  const plan = view.kind === "plan" ? view : null;
  const stories = plan ? storiesForScope(model, plan.story, ui.storyScope) : [];

  if (tool === "joint") {
    const ops: Op[] = plan
      ? stories.map((s) => ({ name: "joint.add", args: { point: [p[0], p[1], s.elevation], story: s.id } }))
      : [{ name: "joint.add", args: { point: p, story: storyAt(model, p[2])?.id } }];
    commit(title, ops);
    return;
  }

  if (tool === "column" && plan) {
    commit(title, columnOps(model, xy(p), stories, section!));
    return;
  }

  if (isPolygonTool(tool, view)) {
    // Bấm lại điểm đầu để đóng đa giác.
    if (pts.length >= 3 && same(pts[0]!, p)) {
      finish(pane);
      return;
    }
    setPoints([...pts, p], pane);
    return;
  }

  // Công cụ hai điểm (dầm, giằng, cột ở mặt đứng, vách ở mặt bằng): vẽ nối tiếp.
  if (!pts.length) {
    setPoints([p], pane);
    return;
  }
  const a = pts[0]!;
  let ops: Op[];
  if (plan) {
    ops = tool === "wall" ? wallOps(model, xy(a), xy(p), stories, section!) : planLineOps(tool as "beam" | "brace", xy(a), xy(p), stories, section!);
  } else {
    const story = storyAt(model, Math.max(a[2], p[2]))?.id;
    ops = [{ name: "frame.add", args: { kind: tool, from: a, to: p, section, ...(story ? { story } : {}) } }];
  }
  if (commit(title, ops)) pts = [p];
  // Cột ở mặt đứng không nối tiếp.
  setPoints(tool === "column" ? [] : pts, pane);
}

/** Kết thúc chuỗi: đóng đa giác nếu đủ điểm, rồi xoá các điểm tạm. */
export function finish(pane?: number): void {
  const ui = useUi.getState();
  const tool = ui.tool;
  const view = ui.views[pane ?? ui.drawPane];
  const pts = ui.drawPoints;
  if (tool !== "select" && isPolygonTool(tool, view) && pts.length >= 3 && view) {
    const model = useModel.getState().model;
    const section = drawSection(model, tool);
    if (section) {
      const title = t().cmd[`draw.${tool}`];
      let ops: Op[];
      if (view.kind === "plan") ops = slabOps(pts.map(xy), storiesForScope(model, view.story, ui.storyScope), section);
      else {
        const story = storyAt(model, Math.max(...pts.map((q) => q[2])))?.id;
        ops = [{ name: "shell.add", args: { kind: tool, points: pts, section, ...(story ? { story } : {}) } }];
      }
      if (!commit(title, ops)) return; // giữ điểm để sửa
    }
  }
  setPoints([]);
}

/** Bỏ điểm vừa bấm. */
export function undoPoint(): void {
  const ui = useUi.getState();
  if (ui.drawPoints.length) setPoints(ui.drawPoints.slice(0, -1));
}

/** Huỷ chuỗi đang vẽ; nếu không có chuỗi thì về công cụ Chọn. */
export function cancel(): void {
  const ui = useUi.getState();
  if (ui.drawPoints.length) setPoints([]);
  else ui.set({ tool: "select" });
}
