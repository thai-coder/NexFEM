import { expect, test, type Page } from "@playwright/test";

type Display = Record<string, boolean>;
type Viewer = { display: Display; worldToScreen(x: number, y: number, z: number): [number, number] };

const display = (page: Page, pane: number) =>
  page.evaluate((i) => (window as unknown as { __nexfemViewers: Viewer[] }).__nexfemViewers[i]!.display, pane);
const selection = (page: Page) =>
  page.evaluate(() => (window as unknown as { __nexfem: { model: { getState(): { selection: string[] } } } }).__nexfem.model.getState().selection);

async function screenOf(page: Page, pane: number, p: [number, number, number]) {
  const local = await page.evaluate(([i, q]) => (window as unknown as { __nexfemViewers: Viewer[] }).__nexfemViewers[i as number]!.worldToScreen(...(q as [number, number, number])), [pane, p] as const);
  const box = (await page.getByTestId(`pane-${pane}`).locator(".pane-canvas").boundingBox())!;
  return { x: box.x + local[0], y: box.y + local[1] };
}

test.beforeEach(async ({ page }) => {
  // Chỉ xoá dữ liệu ở lần mở đầu, để kiểm tra tuỳ chọn còn sau khi tải lại.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      sessionStorage.setItem("seeded", "1");
    }
  });
  await page.goto("/?sample=1");
  await expect(page.getByTestId("viewport")).toBeVisible();
  await page.waitForFunction(() => ((window as unknown as { __nexfemViewers?: unknown[] }).__nexfemViewers?.length ?? 0) >= 2);
});

test("nút ⚙ mở tuỳ chọn hiển thị của đúng cửa sổ; chỉ cửa sổ đó thay đổi", async ({ page }) => {
  await page.getByTestId("view-options-0").click();
  const dlg = page.getByTestId("dlg-viewOptions");
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText("Plan");
  await page.getByTestId("vo-beams").uncheck();
  await page.getByTestId("vo-frameLabels").check();
  await page.getByTestId("dialog-ok").click();
  await expect(dlg).toHaveCount(0);
  expect(await display(page, 0)).toMatchObject({ beams: false, frameLabels: true });
  expect(await display(page, 1)).toMatchObject({ beams: true, frameLabels: false });
  // Mặt bằng chỉ có dầm là thanh nằm trong mặt phẳng: ẩn dầm thì không còn nhãn thanh nào.
  await expect(page.getByTestId("pane-0").locator(".nx-label-tag")).toHaveCount(0);
  await expect(page.getByTestId("pane-1").locator(".nx-label-tag")).toHaveCount(0);
});

test("đối tượng bị ẩn không chọn được bằng khung chọn", async ({ page }) => {
  await page.getByTestId("view-options-0").click();
  await page.getByTestId("vo-beams").uncheck();
  await page.getByTestId("vo-slabs").uncheck();
  await page.getByTestId("dialog-ok").click();
  const a = await screenOf(page, 0, [-1, -1, 11.1]);
  const b = await screenOf(page, 0, [7, 8, 11.1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  // Ô A-B / 1-2 khi đủ đối tượng chọn được 13 (4 dầm, 1 sàn, 4 cột, 4 nút); ẩn dầm và sàn còn 8.
  const sel = await selection(page);
  expect(sel.length).toBe(8);
  expect(sel.some((id) => id.startsWith("bx-") || id.startsWith("by-") || id.startsWith("s-"))).toBe(false);
});

test("Áp dụng cho tất cả cửa sổ; Huỷ không thay đổi gì", async ({ page }) => {
  await page.getByTestId("view-options-1").click();
  await page.getByTestId("vo-grid").uncheck();
  await page.getByRole("button", { name: "Huỷ" }).click();
  expect((await display(page, 1)).grid).toBe(true);

  await page.getByTestId("view-options-1").click();
  await page.getByTestId("vo-grid").uncheck();
  await page.getByTestId("view-apply-all").check();
  await page.getByTestId("dialog-ok").click();
  expect((await display(page, 0)).grid).toBe(false);
  expect((await display(page, 1)).grid).toBe(false);
  await expect(page.getByTestId("pane-0").locator(".nx-label-bubble")).toHaveCount(0);
  await expect(page.getByTestId("pane-1").locator(".nx-label-bubble")).toHaveCount(0);
});

test("Áp dụng giữ hộp thoại mở; Mặc định trả về giá trị ban đầu", async ({ page }) => {
  await page.getByTestId("view-options-0").click();
  await page.getByTestId("vo-sectionNames").check();
  await page.getByTestId("dialog-apply").click();
  await expect(page.getByTestId("dlg-viewOptions")).toBeVisible();
  expect((await display(page, 0)).sectionNames).toBe(true);
  await expect(page.getByTestId("pane-0").locator(".nx-label-tag").first()).toContainText("D300x600");
  await page.getByTestId("view-reset").click();
  await expect(page.getByTestId("vo-sectionNames")).not.toBeChecked();
  await page.getByTestId("dialog-ok").click();
  expect((await display(page, 0)).sectionNames).toBe(false);
});

test("lệnh nhanh trong menu View chỉ áp dụng cho cửa sổ đang hoạt động", async ({ page }) => {
  await page.getByTestId("pane-1").dispatchEvent("pointerdown");
  await page.getByRole("menuitem", { name: "View", exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Hiện nhãn nút" }).click();
  expect((await display(page, 1)).jointLabels).toBe(true);
  expect((await display(page, 0)).jointLabels).toBe(false);
});

test("menu View và menu chuột phải có mục Tuỳ chọn hiển thị", async ({ page }) => {
  await page.getByRole("menuitem", { name: "View", exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Tuỳ chọn hiển thị…" }).click();
  await expect(page.getByTestId("dlg-viewOptions")).toBeVisible();
  await page.keyboard.press("Escape");
  const p = await screenOf(page, 0, [20, 16, 11.1]);
  await page.mouse.click(p.x, p.y, { button: "right" });
  await expect(page.getByRole("menuitem", { name: "Tuỳ chọn hiển thị…" })).toBeVisible();
});

test("tuỳ chọn hiển thị từng cửa sổ còn sau khi tải lại", async ({ page }) => {
  await page.getByTestId("view-options-0").click();
  await page.getByTestId("vo-columns").uncheck();
  await page.getByTestId("dialog-ok").click();
  await page.reload();
  await page.waitForFunction(() => ((window as unknown as { __nexfemViewers?: unknown[] }).__nexfemViewers?.length ?? 0) >= 2);
  expect((await display(page, 0)).columns).toBe(false);
  expect((await display(page, 1)).columns).toBe(true);
});

test("dữ liệu cũ (một bộ hiển thị chung) được dùng cho mọi cửa sổ", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.removeItem("nexfem:viewDisplay");
    localStorage.setItem("nexfem:display", JSON.stringify({ joints: false, jointLabels: false, frameLabels: true, restraints: false }));
  });
  await page.reload();
  await page.waitForFunction(() => ((window as unknown as { __nexfemViewers?: unknown[] }).__nexfemViewers?.length ?? 0) >= 2);
  for (const i of [0, 1]) expect(await display(page, i)).toMatchObject({ joints: false, frameLabels: true, restraints: false, releases: false, beams: true });
});
