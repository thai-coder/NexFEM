import { expect, test, type Page } from "@playwright/test";

type W = {
  __nexfem: { model: { getState(): { selection: string[]; model: { joints: { id: string; restraint?: boolean[] }[] } } }; ui: { getState(): { tool: string } } };
  __nexfemViewers: { worldToScreen(x: number, y: number, z: number): [number, number]; symbolSizes: number[] }[];
};

async function at(page: Page, pane: number, p: [number, number, number]) {
  const l = await page.evaluate(([pane, p]) => (window as unknown as W).__nexfemViewers[pane as number]!.worldToScreen(...(p as [number, number, number])), [pane, p] as const);
  const box = (await page.getByTestId(`pane-${pane}`).locator(".pane-canvas").boundingBox())!;
  return { x: box.x + l[0], y: box.y + l[1] };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/?sample=1");
  await page.waitForFunction(() => ((window as unknown as { __nexfemViewers?: unknown[] }).__nexfemViewers?.length ?? 0) >= 2);
});

test("không còn ribbon; thanh công cụ thấp", async ({ page }) => {
  await expect(page.locator(".ribbon")).toHaveCount(0);
  const h = (await page.getByTestId("toolbar").boundingBox())!.height;
  expect(h).toBeLessThan(45);
});

test("nút Assign ▾ gom các lệnh cùng họ và mở bảng công cụ", async ({ page }) => {
  await page.getByTestId("toolbar").getByRole("button", { name: /Assign/ }).click();
  const menu = page.getByRole("menu");
  for (const t of ["Liên kết gối…", "Tiết diện thanh…", "Nhả liên kết…", "Tải trên thanh…", "Tải trên sàn…"]) await expect(menu.getByRole("menuitem", { name: t })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Liên kết gối…" }).click();
  await expect(page.getByTestId("dlg-assignRestraint")).toBeVisible();
});

test("Assign không chặn khung nhìn: chọn nút SAU khi mở, số lượng cập nhật, rồi gán", async ({ page }) => {
  await page.getByRole("menuitem", { name: "Assign", exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Liên kết gối…" }).click();
  const win = page.getByTestId("dlg-assignRestraint");
  await expect(win).toContainText("Chưa chọn nút nào");
  // Ở mặt bằng, đầu cột trùng vị trí với nút: lọc chỉ chọn nút.
  await page.getByTestId("filter-frame").uncheck();
  await page.getByTestId("filter-shell").uncheck();
  await expect(page.getByTestId("dialog-ok")).toBeDisabled();
  // Vẫn bấm chọn được nút ở khung nhìn khi cửa sổ đang mở.
  const p = await at(page, 0, [0, 0, 11.1]);
  await page.mouse.click(p.x, p.y);
  await expect(win).toContainText("Áp dụng cho 1 nút");
  await win.getByRole("button", { name: "Khớp" }).click();
  await page.getByTestId("dialog-ok").click();
  await expect(win).toHaveCount(0);
  const id = await page.evaluate(() => (window as unknown as W).__nexfem.model.getState().selection[0]!);
  const j = await page.evaluate((id) => (window as unknown as W).__nexfem.model.getState().model.joints.find((x) => x.id === id)!.restraint, id);
  expect(j).toEqual([true, true, true, false, false, false]);
});

test("phím tắt vẫn dùng được khi cửa sổ Assign đang mở", async ({ page }) => {
  await page.getByRole("menuitem", { name: "Assign", exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Liên kết gối…" }).click();
  await expect(page.getByTestId("dlg-assignRestraint")).toBeVisible();
  await page.mouse.click(5, 450);
  await page.keyboard.press("Control+4");
  await expect(page.getByTestId("pane-3")).toBeVisible();
});

test("thanh dọc: nút Dầm/Cột/Giằng gom một nhóm, chọn Giằng thì nút chính đổi", async ({ page }) => {
  const group = page.getByTestId("strip-frames");
  await group.getByRole("button", { name: /dầm|cột|giằng/i }).first().click();
  await group.getByRole("button", { expanded: false }).last().click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Vẽ giằng" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__nexfem.ui.getState().tool)).toBe("brace");
  await expect(group.getByRole("button", { pressed: true })).toHaveAttribute("title", /giằng/i);
});

test("không quét chọn chữ trừ ô nhập và log", async ({ page }) => {
  const us = (sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).userSelect);
  expect(await us("body")).toBe("none");
  expect(await us(".menubar")).toBe("none");
  expect(await us(".log-list")).toBe("text");
  expect(await us('[data-testid="console-input"]')).toBe("text");
});

test("ký hiệu gối đủ lớn để thấy", async ({ page }) => {
  await page.getByTestId("preset-front").click().catch(() => undefined);
  const sizes = await page.evaluate(() => (window as unknown as W).__nexfemViewers[1]!.symbolSizes);
  expect(sizes.length).toBeGreaterThan(0);
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
});

test("mở tắt bảng nhiều lần không làm bảng che khung nhìn", async ({ page }) => {
  const vw = async () => (await page.getByTestId("viewport").boundingBox())!.width;
  const start = await vw();
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("panel-properties").click();
    await page.getByTestId("panel-properties").click();
    await page.getByTestId("panel-explorer").click();
    await page.getByTestId("panel-explorer").click();
    await page.getByTestId("panel-bottom").click();
    await page.getByTestId("panel-bottom").click();
  }
  await expect(page.getByTestId("properties")).toBeVisible();
  const end = await vw();
  expect(end).toBeGreaterThan(1600 * 0.5);
  expect(Math.abs(end - start)).toBeLessThan(90);
});

test("ô One Story ở thanh trạng thái điều khiển phạm vi tầng khi vẽ", async ({ page }) => {
  await page.getByTestId("story-scope").selectOption("all");
  await page.getByTestId("pane-0").click({ position: { x: 5, y: 40 } });
  await page.keyboard.press("b");
  await expect(page.getByTestId("draw-props").getByLabel("Vẽ trên")).toHaveValue("all");
});
