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

test("Mô hình mới từ Start Page mở hộp thoại; tiếp tục với mô hình mẫu về khung nhìn", async ({ page }) => {
  await page.getByTestId("start-new").click();
  await expect(page.getByTestId("dlg-newModel")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("start-sample").click();
  await expect(page.getByTestId("viewport")).toBeVisible();
});

test("tắt 'hiện khi khởi động' thì lần mở sau không còn Start Page", async ({ page }) => {
  await page.getByTestId("start-show").uncheck();
  await page.reload();
  await expect(page.getByTestId("viewport")).toBeVisible();
  await expect(page.getByTestId("start-page")).toHaveCount(0);
});
