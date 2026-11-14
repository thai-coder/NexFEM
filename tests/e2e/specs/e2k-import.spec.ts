import { expect, test, type Page } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE = fileURLToPath(new URL("../../fixtures/csi/etabs/23217_SMFs 3D model_updated v4.e2k", import.meta.url));
type M = { name: string; frames: { kind: string }[]; joints: unknown[]; shells: unknown[]; combos: unknown[] };
const model = (page: Page) => page.evaluate(() => (window as unknown as { __nexfem: { model: { getState(): { model: unknown } } } }).__nexfem.model.getState().model as M);

async function importFixture(page: Page, file = FIXTURE) {
  await page.getByRole("menuitem", { name: "File", exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menu").getByRole("menuitem", { name: "Nhập ETABS / SAP2000 (.e2k, .s2k)…" }).click()]);
  await chooser.setFiles(file);
  await expect(page.getByTestId("dlg-csiImport")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/?sample=1");
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

test("file SAP2000 .s2k: báo rõ chưa hỗ trợ, không cho mở", async ({ page }) => {
  // Dạng bảng của .s2k (dữ liệu tự tạo, chỉ để kiểm tra nhận diện định dạng).
  const path = join(mkdtempSync(join(tmpdir(), "nexfem-e2e-")), "24061_OMF.s2k");
  writeFileSync(path, 'File C:\\x\\24061_OMF.s2k\r\n\r\nTABLE:  "PROGRAM CONTROL"\r\n   ProgramName=SAP2000   Version=23.1.0   CurrUnits="KN, m, C"\r\n');
  await importFixture(page, path);
  await expect(page.getByTestId("csi-error")).toContainText("SAP2000 23.1.0 (.s2k): chưa hỗ trợ nhập SAP2000");
  await expect(page.getByTestId("csi-open")).toBeDisabled();
  await expect(page.getByTestId("dlg-csiImport")).toContainText("Không có mô hình để mở");
});
