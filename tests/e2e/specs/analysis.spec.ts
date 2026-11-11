import { expect, test, type Page } from "@playwright/test";

type W = {
  __nexfem: {
    model: { getState(): { locked: boolean; model: { joints: { id: string; restraint?: boolean[] }[] }; run(n: string, a: unknown): unknown; selection: string[] } };
  };
};

const state = (page: Page) => page.evaluate(() => (window as unknown as W).__nexfem.model.getState().locked);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await expect(page.getByTestId("viewport")).toBeVisible();
});

test("F5 chạy bộ giải: khoá mô hình, cân bằng tải, bảng phản lực; F6 mở khoá", async ({ page }) => {
  await page.keyboard.press("F5");
  const bottom = page.getByTestId("bottom");
  await expect(bottom).toContainText("Phân tích xong");
  await expect(bottom).toContainText("SDL: tổng tải Z = -1944.000, tổng phản lực Z = 1944.000 (kN)");
  await expect(bottom).toContainText("Modal (modal) chưa được hỗ trợ");
  expect(await state(page)).toBe(true);
  await expect(page.getByTestId("properties")).toContainText("Mô hình đang khoá");

  // Bảng phản lực của tổ hợp SERVICE.
  await bottom.getByRole("tab", { name: /Bảng dữ liệu/ }).click();
  await bottom.getByLabel("Bảng").selectOption("reactions");
  await page.getByTestId("result-case").selectOption({ label: "SERVICE" });
  await expect(bottom.locator("tbody tr")).toHaveCount(12);

  // Đang khoá thì không vẽ được.
  await page.keyboard.press("b");
  await expect(page.getByTestId("draw-props")).toHaveCount(0);

  await page.keyboard.press("F6");
  expect(await state(page)).toBe(false);
  await expect(bottom).toContainText("Chưa có kết quả");
});

test("mô hình thiếu gối: báo mất ổn định và chọn nút có vấn đề", async ({ page }) => {
  await page.evaluate(() => {
    const s = (window as unknown as W).__nexfem.model.getState();
    s.run("joint.assignRestraint", { joints: s.model.joints.filter((j) => j.restraint).map((j) => j.id), restraint: [false, false, false, false, false, false] });
  });
  await page.keyboard.press("F5");
  // Check model chặn trước khi giải.
  await expect(page.getByTestId("bottom")).toContainText("Mô hình chưa có gối nào");
  expect(await state(page)).toBe(false);
});

test("không mất trạng thái mô hình chưa lưu sau khi tạo mới", async ({ page }) => {
  await page.keyboard.press("Control+n");
  await page.getByTestId("create-model").click();
  const dirty = await page.evaluate(() => (window as unknown as { __nexfem: { model: { getState(): { dirty: boolean } } } }).__nexfem.model.getState().dirty);
  expect(dirty).toBe(true);
});
