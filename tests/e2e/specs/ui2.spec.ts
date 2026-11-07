import { expect, test, type Page } from "@playwright/test";

type W = { __nexfem: { model: { getState(): { model: Record<string, unknown> & { frames: { id: string; label: string }[]; joints: { id: string; label: string; x: number }[]; designCodes: Record<string, string> }; selection: string[]; select(ids: string[]): void } } } };

const m = (page: Page) => page.evaluate(() => (window as unknown as W).__nexfem.model.getState().model);
const sel = (page: Page) => page.evaluate(() => (window as unknown as W).__nexfem.model.getState().selection);

async function at(page: Page, pane: number, p: [number, number, number]) {
  const l = await page.evaluate(
    ([pane, p]) => (window as unknown as { __nexfemViewers: { worldToScreen(x: number, y: number, z: number): [number, number] }[] }).__nexfemViewers[pane as number]!.worldToScreen(...(p as [number, number, number])),
    [pane, p] as const,
  );
  const box = (await page.getByTestId(`pane-${pane}`).locator(".pane-canvas").boundingBox())!;
  return { x: box.x + l[0], y: box.y + l[1] };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.waitForFunction(() => ((window as unknown as { __nexfemViewers?: unknown[] }).__nexfemViewers?.length ?? 0) >= 2);
});

test("chế độ tập trung và nút bật/tắt bảng ở thanh trạng thái", async ({ page }) => {
  await expect(page.getByTestId("explorer")).toBeVisible();
  await page.getByTestId("panel-explorer").click();
  await expect(page.getByTestId("explorer")).toHaveCount(0);
  await page.getByTestId("panel-explorer").click();
  await expect(page.getByTestId("explorer")).toBeVisible();

  await page.keyboard.press("Control+Shift+F");
  for (const id of ["explorer", "properties", "bottom"]) await expect(page.getByTestId(id)).toHaveCount(0);
  await page.keyboard.press("Control+Shift+F");
  for (const id of ["explorer", "properties", "bottom"]) await expect(page.getByTestId(id)).toBeVisible();
});

test("ribbon gọn thấp hơn ribbon đầy đủ", async ({ page }) => {
  const h = async () => (await page.locator(".ribbon").boundingBox())!.height;
  const compact = await h();
  await page.getByTitle("Ribbon gọn").click();
  const full = await h();
  expect(compact).toBeLessThan(full - 25);
  expect(compact).toBeLessThan(80);
});

test("chuột phải vào dầm: menu, đổi nhãn, báo trùng nhãn", async ({ page }) => {
  const p = await at(page, 0, [3, 0, 11.1]);
  await page.mouse.click(p.x, p.y, { button: "right" });
  const menu = page.getByTestId("context-menu");
  await expect(menu).toContainText("1 đối tượng đang chọn");
  await expect(menu).toContainText("Thông tin / thuộc tính");
  await expect(menu).toContainText("Nhân bản");
  await menu.getByRole("menuitem", { name: /Đổi nhãn/ }).click();
  const dlg = page.getByTestId("dlg-rename");
  await dlg.getByTestId("rename-input").fill("C1");
  await dlg.getByTestId("dialog-ok").click();
  await expect(dlg.getByRole("alert")).toContainText("đã có");
  await dlg.getByTestId("rename-input").fill("DAM-TRUC1");
  await dlg.getByTestId("dialog-ok").click();
  await expect(dlg).toHaveCount(0);
  const id = (await sel(page))[0]!;
  expect((await m(page)).frames.find((f) => f.id === id)!.label).toBe("DAM-TRUC1");
});

test("chuột phải vào trục lưới mở hộp thoại sửa lưới; bấm đúp vào trục cũng vậy", async ({ page }) => {
  // Trục B (x = 6) kéo dài ra ngoài công trình 1,5 m: lấy điểm y = -1 để không trúng thanh nào.
  const p = await at(page, 0, [6, -1, 11.1]);
  await page.mouse.click(p.x, p.y, { button: "right" });
  const menu = page.getByTestId("context-menu");
  await expect(menu).toContainText("Trục B");
  await menu.getByRole("menuitem", { name: /Sửa lưới trục/ }).click();
  await expect(page.getByTestId("dlg-gridStory")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.getByTestId("dlg-gridStory")).toBeVisible();
});

test("kéo khung chọn nút; bộ lọc chỉ chọn nút; gán gối cho nút đã chọn", async ({ page }) => {
  await page.getByTestId("filter-frame").uncheck();
  await page.getByTestId("filter-shell").uncheck();
  const a = await at(page, 0, [-1, -1, 11.1]);
  const b = await at(page, 0, [7, 8, 11.1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  expect(await sel(page)).toHaveLength(4);
  await page.getByRole("menuitem", { name: "Assign", exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Liên kết gối…" }).click();
  await expect(page.getByTestId("dlg-assignRestraint")).toContainText("Áp dụng cho 4 nút");
});

test("sửa toạ độ và nhãn của nút trong Properties", async ({ page }) => {
  await page.getByTestId("console-input").fill("select 1");
  await page.getByTestId("console-input").press("Enter");
  const props = page.getByTestId("properties");
  await expect(props).toContainText("Nút 1");
  await page.getByTestId("joint-x").fill("0.5");
  await props.getByTestId("apply").click();
  const j = (await m(page)).joints.find((x) => x.label === "1")!;
  expect(j.x).toBeCloseTo(0.5);
  await props.getByTestId("label-input").fill("N-GOC");
  await props.getByTestId("label-input").press("Enter");
  expect((await m(page)).joints.find((x) => x.id === j.id)!.label).toBe("N-GOC");
});

test("chọn tiêu chuẩn khi tạo mô hình mới", async ({ page }) => {
  await page.keyboard.press("Control+n");
  await page.getByTestId("code-concrete").selectOption("EN 1992-1-1");
  await page.getByTestId("code-steel").selectOption("AISC 360-22");
  await page.getByTestId("create-model").click();
  expect((await m(page)).designCodes).toMatchObject({ concrete: "EN 1992-1-1", steel: "AISC 360-22", loads: "TCVN 2737:2023" });
});

test("hiện nhãn nút và nhãn thanh trên khung nhìn", async ({ page }) => {
  const labels = page.getByTestId("pane-0").locator(".nx-label-tag");
  await expect(labels).toHaveCount(0);
  await page.getByRole("menuitem", { name: "View", exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Hiện nhãn nút" }).click();
  await expect(labels).toHaveCount(12);
  await page.getByRole("menuitem", { name: "View", exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Hiện nhãn thanh" }).click();
  await expect(labels).toHaveCount(12 + 17);
});
