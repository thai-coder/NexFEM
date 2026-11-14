import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const FIXTURE = fileURLToPath(new URL("../../fixtures/csi/etabs/23217_SMFs 3D model_updated v4.e2k", import.meta.url));
type M = { name: string; frames: { kind: string }[]; joints: unknown[]; shells: unknown[]; combos: unknown[] };
const model = (page: Page) => page.evaluate(() => (window as unknown as { __nexfem: { model: { getState(): { model: unknown } } } }).__nexfem.model.getState().model as M);

async function importFixture(page: Page) {
  await page.getByRole("menuitem", { name: "File", exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menu").getByRole("menuitem", { name: "Nhập ETABS (.e2k)…" }).click()]);
  await chooser.setFiles(FIXTURE);
  await expect(page.getByTestId("dlg-csiImport")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await expect(page.getByTestId("viewport")).toBeVisible();
});

test("nhập file ETABS thật: báo cáo số lượng và phần không nhập được trước khi mở", async ({ page }) => {
  await importFixture(page);
  await expect(page.getByTestId("csi-source")).toContainText("ETABS 23.2.0");
  await expect(page.getByTestId("csi-source")).toContainText("LB, IN");
  const counts = page.getByTestId("csi-counts");
  await expect(counts.locator("tr", { hasText: "Thanh (theo tầng)" })).toContainText("322");
  await expect(counts.locator("tr", { hasText: "Thanh (theo tầng)" })).toContainText("298");
  await expect(counts.locator("tr", { hasText: "Tải tập trung tại nút" })).toContainText("31");
  const errors = page.getByTestId("csi-error");
  await expect(errors).toContainText("Tải tập trung tại nút");
  await expect(errors).toContainText("Lò xo nền dưới sàn");
  await expect(errors).toContainText("Steel Angle");
  await expect(errors).toContainText("không có gối");
  await expect(page.getByTestId("csi-warning")).toContainText("Góc xoay trục địa phương 90°");
  // Chưa mở: mô hình hiện tại không đổi.
  expect((await model(page)).name).toBe("Toa_nha_A");
});

test("mở mô hình đã nhập; F5 bị chặn vì thiếu gối", async ({ page }) => {
  await importFixture(page);
  await page.getByTestId("csi-open").click();
  await expect(page.getByTestId("dlg-csiImport")).toHaveCount(0);
  const m = await model(page);
  expect(m.name).toBe("23217_SMFs 3D model_updated v4");
  expect(m.frames.filter((f) => f.kind === "beam").length).toBe(244);
  expect(m.frames.filter((f) => f.kind === "column").length).toBe(54);
  expect(m.shells.length).toBe(29);
  expect(m.combos.length).toBe(87);
  await expect(page.getByTestId("bottom")).toContainText("Đã nhập 23217_SMFs 3D model_updated v4.e2k");
  await page.keyboard.press("F5");
  // Bị chặn: tab Messages hiện lỗi thiếu gối.
  await expect(page.getByTestId("bottom")).toContainText("Mô hình chưa có gối nào");
});

test("Huỷ thì không đổi mô hình", async ({ page }) => {
  await importFixture(page);
  await page.getByRole("button", { name: "Huỷ" }).click();
  await expect(page.getByTestId("dlg-csiImport")).toHaveCount(0);
  expect((await model(page)).name).toBe("Toa_nha_A");
});
