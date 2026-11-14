import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const FIXTURE = fileURLToPath(new URL("../../fixtures/csi/etabs/23217_SMFs 3D model_updated v4.e2k", import.meta.url));
const SAP = (name: string) => fileURLToPath(new URL(`../../fixtures/csi/sap2000/${name}`, import.meta.url));
type M = { name: string; frames: { kind: string; angle?: number }[]; joints: unknown[]; shells: unknown[]; combos: unknown[] };
const model = (page: Page) => page.evaluate(() => (window as unknown as { __nexfem: { model: { getState(): { model: unknown } } } }).__nexfem.model.getState().model as M);

/** File → Nhập file → mục của chương trình (menu con, mỗi định dạng một mục riêng). */
async function importFixture(page: Page, file = FIXTURE, item = "ETABS (.e2k)…") {
  await page.getByRole("menuitem", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Nhập file" }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menu", { name: "Nhập file" }).getByRole("menuitem", { name: item }).click()]);
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
  await expect(page.getByTestId("csi-warning")).not.toContainText("Góc xoay");
  await expect(page.getByTestId("csi-info")).toContainText("Góc xoay trục địa phương của thanh được nhập");
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

test("menu Nhập file: mỗi định dạng một mục riêng, DXF/IFC/Excel để giai đoạn sau", async ({ page }) => {
  await page.getByRole("menuitem", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Nhập file" }).hover();
  const sub = page.getByRole("menu", { name: "Nhập file" });
  await expect(sub.getByRole("menuitem")).toHaveText([/ETABS \(\.e2k\)…/, /SAP2000 \(\.s2k, \.\$2k\)…/, /DXF…/, /IFC…/, /Excel…/]);
  await expect(sub.getByRole("menuitem", { name: /DXF/ })).toContainText("GĐ 8");
});

test("nhập file SAP2000 thật (.s2k): báo cáo rồi mở mô hình", async ({ page }) => {
  await importFixture(page, SAP("24061_OMF.s2k"), "SAP2000 (.s2k, .$2k)…");
  await expect(page.getByTestId("dlg-csiImport")).toContainText("Nhập file SAP2000");
  await expect(page.getByTestId("csi-source")).toContainText("SAP2000 23.1.0");
  await expect(page.getByTestId("csi-source")).toContainText("LB, FT");
  await expect(page.getByTestId("csi-error")).toContainText("Tải tập trung tại nút (mẫu WY)");
  await expect(page.getByTestId("csi-info")).toContainText("Góc xoay trục địa phương của thanh được nhập");
  await page.getByTestId("csi-open").click();
  const m = await model(page);
  expect(m.name).toBe("24061_OMF");
  expect(m.frames.map((f) => f.kind)).toEqual(["column", "column", "beam"]);
  expect(m.frames.map((f) => f.angle)).toEqual([90, 90, undefined]);
  expect(m.combos.length).toBe(87);
  await expect(page.getByTestId("bottom")).toContainText("Đã nhập 24061_OMF.s2k");
});

test("file SAP2000 25 có mặt None (.2k)", async ({ page }) => {
  await importFixture(page, SAP("Roof_model.2k"), "SAP2000 (.s2k, .$2k)…");
  await expect(page.getByTestId("csi-source")).toContainText("SAP2000 25.3.1");
  await expect(page.getByTestId("csi-error")).toHaveCount(0);
  await page.getByTestId("csi-open").click();
  const m = await model(page);
  expect([m.frames.length, m.shells.length]).toEqual([13, 4]);
});

test("file .sdb nhị phân: báo cách xuất .s2k, không cho mở", async ({ page }) => {
  await importFixture(page, SAP("Roof_model.sdb"), "SAP2000 (.s2k, .$2k)…");
  await expect(page.getByTestId("csi-error")).toContainText("cơ sở dữ liệu nhị phân riêng của CSI");
  await expect(page.getByTestId("csi-error")).toContainText("File → Export");
  await expect(page.getByTestId("csi-open")).toBeDisabled();
  await expect(page.getByTestId("dlg-csiImport")).toContainText("Không có mô hình để mở");
});

test("chọn mục ETABS nhưng file là SAP2000: nhập theo nội dung, có cảnh báo", async ({ page }) => {
  await importFixture(page, SAP("Roof_model.2k"), "ETABS (.e2k)…");
  await expect(page.getByTestId("csi-warning")).toContainText("Đã chọn mục nhập ETABS nhưng file là SAP2000");
  await expect(page.getByTestId("csi-open")).toBeEnabled();
});
