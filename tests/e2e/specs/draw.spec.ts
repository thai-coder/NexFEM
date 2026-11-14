import { expect, test, type Page } from "@playwright/test";

type J = { id: string; x: number; y: number; z: number };
type F = { id: string; label: string; kind: string; i: string; j: string; story?: string };
type S = { id: string; label: string; kind: string; joints: string[] };
type M = { joints: J[]; frames: F[]; shells: S[] };

const model = (page: Page) =>
  page.evaluate(() => (window as unknown as { __nexfem: { model: { getState(): { model: unknown } } } }).__nexfem.model.getState().model as M);

const ui = (page: Page, patch: Record<string, unknown>) =>
  page.evaluate((p) => (window as unknown as { __nexfem: { ui: { getState(): { set(x: unknown): void } } } }).__nexfem.ui.getState().set(p), patch);

async function at(page: Page, pane: number, p: [number, number, number], offset: [number, number] = [0, 0]) {
  const local = await page.evaluate(
    ([pane, p]) => {
      const v = (window as unknown as { __nexfemViewers: { worldToScreen(x: number, y: number, z: number): [number, number] }[] }).__nexfemViewers[pane as number]!;
      const [x, y, z] = p as [number, number, number];
      return v.worldToScreen(x, y, z);
    },
    [pane, p] as const,
  );
  const box = (await page.getByTestId(`pane-${pane}`).locator(".pane-canvas").boundingBox())!;
  return { x: box.x + local[0] + offset[0], y: box.y + local[1] + offset[1] };
}

async function click(page: Page, pane: number, p: [number, number, number], offset: [number, number] = [0, 0]) {
  const s = await at(page, pane, p, offset);
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y);
}

const ends = (m: M, f: F) => {
  const j = new Map(m.joints.map((x) => [x.id, x]));
  return [j.get(f.i)!, j.get(f.j)!].map((p) => [p.x, p.y, p.z].map((v) => Math.round(v * 1000) / 1000));
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/?sample=1");
  await page.waitForFunction(() => ((window as unknown as { __nexfemViewers?: unknown[] }).__nexfemViewers?.length ?? 0) >= 2);
  // Ô 0 là mặt bằng Tầng 3 (z = 11.1).
  await page.getByTestId("pane-0").click({ position: { x: 5, y: 40 } });
});

test("vẽ dầm nối tiếp, bắt trung điểm dù bấm lệch vài pixel", async ({ page }) => {
  const n = (await model(page)).frames.length;
  await page.keyboard.press("b");
  await expect(page.getByTestId("draw-props")).toContainText("Vẽ dầm");
  await click(page, 0, [3, 0, 11.1], [4, -3]);
  await click(page, 0, [3, 7.2, 11.1], [-3, 2]);
  await click(page, 0, [3, 14.4, 11.1]);
  await page.keyboard.press("Escape");
  const m = await model(page);
  expect(m.frames.length).toBe(n + 2);
  expect(ends(m, m.frames.at(-2)!)).toEqual([
    [3, 0, 11.1],
    [3, 7.2, 11.1],
  ]);
  expect(ends(m, m.frames.at(-1)!)).toEqual([
    [3, 7.2, 11.1],
    [3, 14.4, 11.1],
  ]);
  // Esc lần hai về công cụ Chọn.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("draw-props")).toHaveCount(0);
});

test("vẽ cột tại một điểm mặt bằng", async ({ page }) => {
  await page.keyboard.press("c");
  await click(page, 0, [9, 0, 11.1]);
  const m = await model(page);
  const c = m.frames.at(-1)!;
  expect(c.kind).toBe("column");
  expect(ends(m, c)).toEqual([
    [9, 0, 7.5],
    [9, 0, 11.1],
  ]);
});

test("vẽ sàn đa giác: bấm lại điểm đầu để đóng; Backspace bỏ điểm", async ({ page }) => {
  const n = (await model(page)).shells.length;
  await page.keyboard.press("s");
  await click(page, 0, [0, 0, 11.1]);
  await click(page, 0, [6, 0, 11.1]);
  await click(page, 0, [12, 0, 11.1]);
  await page.keyboard.press("Backspace");
  await click(page, 0, [6, 7.2, 11.1]);
  await click(page, 0, [0, 0, 11.1]);
  const m = await model(page);
  expect(m.shells.length).toBe(n + 1);
  expect(m.shells.at(-1)!.joints.length).toBe(3);
  expect(m.shells.at(-1)!.kind).toBe("slab");
});

test("vẽ dầm cho tất cả tầng = một bước hoàn tác", async ({ page }) => {
  const n = (await model(page)).frames.length;
  await page.keyboard.press("b");
  await page.getByTestId("draw-props").getByLabel("Vẽ trên").selectOption("all");
  await click(page, 0, [9, 0, 11.1]);
  await click(page, 0, [9, 7.2, 11.1]);
  await page.keyboard.press("Enter");
  expect((await model(page)).frames.length).toBe(n + 5);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  expect((await model(page)).frames.length).toBe(n);
});

test("vách: báo thiếu tiết diện, tạo tiết diện rồi vẽ", async ({ page }) => {
  await page.keyboard.press("w");
  await expect(page.getByTestId("draw-props")).toContainText("Chưa có tiết diện phù hợp");
  await page.getByTestId("console-input").fill(
    'cmd definition.upsert {"collection":"shellSections","item":{"id":"sec-wall","name":"W250","material":"mat-b25","kind":"wall","formulation":"shell-thin","thickness":0.25}}',
  );
  await page.getByTestId("console-input").press("Enter");
  await expect(page.getByTestId("draw-section")).toHaveValue("sec-wall");
  await click(page, 0, [0, 0, 11.1]);
  await click(page, 0, [6, 0, 11.1]);
  const m = await model(page);
  const w = m.shells.at(-1)!;
  expect(w.kind).toBe("wall");
  const zs = w.joints.map((id) => m.joints.find((j) => j.id === id)!.z).sort((a, b) => a - b);
  expect(zs).toEqual([7.5, 7.5, 11.1, 11.1]);
});

test("vẽ giằng xiên ở mặt đứng trục A", async ({ page }) => {
  await page.evaluate(() =>
    (window as unknown as { __nexfem: { ui: { getState(): { setView(i: number, v: unknown): void } } } }).__nexfem.ui
      .getState()
      .setView(0, { kind: "elevation", grid: "grid-main", line: "gx-0" }),
  );
  await page.waitForTimeout(200);
  await page.keyboard.press("r");
  await click(page, 0, [0, 0, 3.9]);
  await click(page, 0, [0, 7.2, 7.5]);
  await page.keyboard.press("Escape");
  const m = await model(page);
  const d = m.frames.at(-1)!;
  expect(d.kind).toBe("brace");
  expect(d.story).toBe("story-2");
  expect(ends(m, d)).toEqual([
    [0, 0, 3.9],
    [0, 7.2, 7.5],
  ]);
});

test("khung 3D không vẽ được và có gợi ý", async ({ page }) => {
  await ui(page, { activePane: 1 });
  await page.keyboard.press("b");
  // Công cụ vẽ tự chuyển sang ô mặt bằng.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __nexfem: { ui: { getState(): { activePane: number } } } }).__nexfem.ui.getState().activePane)).toBe(0);
});

test("nhân bản dầm theo phương Y, bỏ qua bản trùng", async ({ page }) => {
  await page.getByTestId("console-input").fill("select B1");
  await page.getByTestId("console-input").press("Enter");
  await page.keyboard.press("Control+r");
  const dlg = page.getByTestId("dlg-replicate");
  await expect(dlg).toContainText("1 đối tượng đang chọn");
  await page.getByTestId("rep-dy").fill("3.6");
  await page.getByTestId("rep-count").fill("2");
  await page.getByTestId("dialog-ok").click();
  await expect(dlg).toHaveCount(0);
  // Bản thứ hai trùng dầm trục 2 có sẵn nên bị bỏ qua.
  await expect(page.getByTestId("bottom")).toContainText("tạo 1 đối tượng, bỏ qua 1 bản trùng");
  const m = await model(page);
  expect(ends(m, m.frames.at(-1)!)).toEqual([
    [0, 3.6, 3.9],
    [6, 3.6, 3.9],
  ]);
});
