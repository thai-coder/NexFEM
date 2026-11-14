import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

type Sec = { name: string; material: string; geometry: Record<string, unknown> };
type Mat = { id: string; type: string };
const model = (page: Page) =>
  page.evaluate(() => (window as unknown as { __nexfem: { model: { getState(): { model: { frameSections: Sec[]; materials: Mat[] } } } } }).__nexfem.model.getState().model);
const SAMPLE = fileURLToPath(new URL("../fixtures/steel-library-sample.csv", import.meta.url));

async function openSections(page: Page) {
  await page.getByRole("menuitem", { name: "Define", exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Tiết diện thanh…" }).click();
  await expect(page.getByTestId("dlg-frameSections")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      sessionStorage.setItem("seeded", "1");
    }
  });
  await page.goto("/");
  await expect(page.getByTestId("viewport")).toBeVisible();
});

test("nạp thư viện thép CSV: báo dòng lỗi và tiết diện lệch so với bảng; thêm tiết diện từ thư viện", async ({ page }) => {
  await openSections(page);
  await expect(page.getByTestId("steel-status")).toContainText("Chưa nạp thư viện thép");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("steel-import").click()]);
  await chooser.setFiles(SAMPLE);
  await expect(page.getByTestId("steel-status")).toContainText("3 tiết diện; đối chiếu được 3, lệch quá ngưỡng 1");
  await expect(page.getByTestId("steel-library")).toContainText("1 dòng không đọc được");
  await page.getByTestId("steel-flagged").locator("summary").click();
  await expect(page.getByTestId("steel-flagged")).toContainText("IPE 300 sai");
  // Mô hình mẫu chỉ có vật liệu bê tông và cốt thép: có cảnh báo chưa có vật liệu thép hình.
  await expect(page.getByTestId("steel-library")).toContainText("chưa có vật liệu thép");

  await page.getByTestId("dlg-frameSections").getByLabel("Thêm từ thư viện…").selectOption({ label: "HEB 300" });
  await expect(page.getByTestId("define-name")).toHaveValue("HEB 300");
  await expect(page.getByTestId("dim-r")).toHaveValue(/27|0[.,]027/);
  await page.getByTestId("dialog-ok").click();
  const sec = (await model(page)).frameSections.find((s) => s.name === "HEB 300");
  expect(sec?.geometry).toEqual({ shape: "I", h: 0.3, bf: 0.3, tw: 0.011, tf: 0.019, r: 0.027 });
});

test("thư viện đã nạp còn sau khi tải lại; gỡ thư viện", async ({ page }) => {
  await openSections(page);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("steel-import").click()]);
  await chooser.setFiles(SAMPLE);
  await expect(page.getByTestId("steel-status")).toContainText("3 tiết diện");
  await page.reload();
  await expect(page.getByTestId("viewport")).toBeVisible();
  await openSections(page);
  await expect(page.getByTestId("steel-status")).toContainText("steel-library-sample.csv: 3 tiết diện");
  await page.getByTestId("steel-clear").click();
  await expect(page.getByTestId("steel-status")).toContainText("Chưa nạp thư viện thép");
});
