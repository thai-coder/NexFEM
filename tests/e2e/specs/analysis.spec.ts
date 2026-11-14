import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

type W = {
  __nexfem: {
    model: { getState(): { locked: boolean; model: { joints: { id: string; restraint?: boolean[] }[] }; run(n: string, a: unknown): unknown; selection: string[] } };
  };
};

const state = (page: Page) => page.evaluate(() => (window as unknown as W).__nexfem.model.getState().locked);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/?sample=1");
  await expect(page.getByTestId("viewport")).toBeVisible();
});

test("F5 chạy bộ giải: khoá mô hình, cân bằng tải, bảng phản lực; F6 mở khoá", async ({ page }) => {
  const toolbarCase = page.getByTestId("toolbar-result-case");
  await expect(toolbarCase).toHaveCount(0);
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
  const tableCase = page.getByTestId("result-case");
  await expect(toolbarCase).toHaveValue("lc-dl");
  await expect(tableCase).toHaveValue("lc-dl");
  await tableCase.selectOption("co-service");
  await expect(toolbarCase).toHaveValue("co-service");
  await expect(bottom.locator("tbody tr")).toHaveCount(12);
  const firstFz = bottom.locator("tbody tr").first().locator("td").nth(3);
  const serviceFz = await firstFz.innerText();
  await toolbarCase.selectOption("lc-sdl");
  await expect(tableCase).toHaveValue("lc-sdl");
  await expect(firstFz).not.toHaveText(serviceFz);

  // Đang khoá thì không vẽ được.
  await page.keyboard.press("b");
  await expect(page.getByTestId("draw-props")).toHaveCount(0);

  await page.keyboard.press("F6");
  expect(await state(page)).toBe(false);
  await expect(bottom).toContainText("Chưa có kết quả");
  await expect(toolbarCase).toHaveCount(0);
  await expect(tableCase).toHaveCount(0);
});

test("nhãn kết quả 5B đúng loại và New/Open xoá case đang xem", async ({ page }) => {
  const created = await page.evaluate(() => {
    const model = (window as unknown as W).__nexfem.model.getState();
    return (["envelope", "srss"] as const).map((type) => model.run("definition.upsert", {
      collection: "combos",
      item: { id: `co-${type}`, name: type.toUpperCase(), type, items: [{ case: "lc-dl", factor: 1 }, { case: "lc-sdl", factor: 1 }] },
    }));
  });
  expect(created).toMatchObject([{ ok: true }, { ok: true }]);

  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+s")]);
  const file = { name: "results-model.nxf", mimeType: "application/zip", buffer: await readFile(await download.path()) };
  await page.keyboard.press("F5");
  const toolbarCase = page.getByTestId("toolbar-result-case");
  await expect(toolbarCase.getByRole("option", { name: /Bao MAX theo thành phần/ })).toHaveCount(1);
  await expect(toolbarCase.getByRole("option", { name: /Bao MIN theo thành phần/ })).toHaveCount(1);
  await expect(toolbarCase.getByRole("option", { name: /SRSS tải tĩnh/ })).toHaveCount(1);
  await toolbarCase.selectOption("co-srss");

  await page.keyboard.press("Control+n");
  await page.getByTestId("new-next").click();
  await page.getByTestId("create-model").click();
  await expect(toolbarCase).toHaveCount(0);
  expect(await state(page)).toBe(false);

  await page.keyboard.press("F5");
  await expect(toolbarCase).toHaveValue("lc-dl");
  page.once("dialog", (dialog) => void dialog.accept());
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Control+o")]);
  await chooser.setFiles(file);
  await expect(toolbarCase).toHaveCount(0);
  expect(await state(page)).toBe(false);

  await page.keyboard.press("F5");
  await expect(toolbarCase).toHaveValue("lc-dl");
  await expect(toolbarCase.getByRole("option", { name: /SRSS tải tĩnh/ })).toHaveCount(1);
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
  await page.getByTestId("new-next").click();
  await page.getByTestId("create-model").click();
  const dirty = await page.evaluate(() => (window as unknown as { __nexfem: { model: { getState(): { dirty: boolean } } } }).__nexfem.model.getState().dirty);
  expect(dirty).toBe(true);
});

test("F5 hai lần liên tiếp chỉ được ghi nhận một lần phân tích", async ({ page }) => {
  await page.keyboard.press("F5");
  await page.keyboard.press("F5");
  await expect(page.getByTestId("bottom")).toContainText("Phân tích xong");
  const doneCount = await page.evaluate(() =>
    (window as unknown as { __nexfem: { ui: { getState(): { logs: { text: string }[] } } } })
      .__nexfem.ui.getState().logs.filter((entry) => entry.text.includes("Phân tích xong")).length
  );
  expect(doneCount).toBe(1);
  expect(await state(page)).toBe(true);
  await page.keyboard.press("F6");
  expect(await state(page)).toBe(false);
});
