import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Chạy tự động mặc định tắt Start Page; bật lại cho riêng bộ test này.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      localStorage.setItem("nexfem:showStartPage", "true");
      sessionStorage.setItem("seeded", "1");
    }
  });
  // Mở app như người dùng: mô hình trống, không nạp mẫu.
  await page.goto("/");
});

test("Start Page hiện khi khởi động, có 3 tab và nút tạo/mở mô hình", async ({ page }) => {
  const start = page.getByTestId("start-page");
  await expect(start).toBeVisible();
  await expect(start.getByTestId("start-new")).toBeVisible();
  await expect(start.getByTestId("start-open")).toBeVisible();
  await expect(start.getByRole("tab")).toHaveCount(3);
  await start.getByRole("tab", { name: "Phiên bản" }).click();
  await expect(start).toContainText("Phiên bản hiện tại");
});

type M = { name: string; joints: unknown[]; frames: unknown[] };
const model = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __nexfem: { model: { getState(): { model: unknown; dirty: boolean } } } }).__nexfem.model.getState().model as M);

test("mở app là mô hình trống; nút Mở mô hình mẫu nạp mẫu và về khung nhìn", async ({ page }) => {
  const m0 = await model(page);
  expect(m0.joints.length).toBe(0);
  expect(m0.frames.length).toBe(0);
  await expect(page).toHaveTitle(/Chưa đặt tên/);
  await expect(page.getByTestId("bottom")).toContainText("NexFEM sẵn sàng. Tạo mô hình mới");
  await page.getByTestId("start-new").click();
  await expect(page.getByTestId("dlg-newModel")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("start-sample").click();
  await expect(page.getByTestId("viewport")).toBeVisible();
  const m = await model(page);
  expect(m.name).toBe("Toa_nha_A");
  expect(m.frames.length).toBeGreaterThan(100);
  await expect(page.getByTestId("bottom")).toContainText("Đã mở mô hình mẫu Toa_nha_A");
});

test("File ▸ Mở mô hình mẫu", async ({ page }) => {
  await page.getByRole("menuitem", { name: "File", exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Mở mô hình mẫu" }).click();
  expect((await model(page)).name).toBe("Toa_nha_A");
});

test("tắt 'hiện khi khởi động' thì lần mở sau không còn Start Page", async ({ page }) => {
  await page.getByTestId("start-show").uncheck();
  await page.reload();
  await expect(page.getByTestId("viewport")).toBeVisible();
  await expect(page.getByTestId("start-page")).toHaveCount(0);
});
