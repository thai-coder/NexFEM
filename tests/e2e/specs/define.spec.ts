import { expect, test, type Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type M = {
  name: string;
  stories: { id: string; name: string; elevation: number }[];
  grids: { x: { label: string; coord: number }[]; y: { label: string; coord: number }[] }[];
  joints: { x: number; y: number; z: number }[];
  frames: unknown[];
  materials: { name: string }[];
  frameSections: { id: string; name: string; geometry: Record<string, unknown> }[];
  combos: { name: string; items: { case: string; factor: number }[] }[];
};

const model = (page: Page) =>
  page.evaluate(() => (window as unknown as { __nexfem: { model: { getState(): { model: unknown } } } }).__nexfem.model.getState().model as M);
const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __nexfem: { model: { getState(): { dirty: boolean; fileName: string | null; canUndo: boolean } } } }).__nexfem.model.getState();
    return { dirty: s.dirty, fileName: s.fileName, canUndo: s.canUndo };
  });

async function openDialog(page: Page, menu: string, item: string) {
  await page.getByRole("menuitem", { name: menu, exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: item }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await expect(page.getByTestId("viewport")).toBeVisible();
});

test("tạo mô hình mới chỉ có lưới trục", async ({ page }) => {
  await page.keyboard.press("Control+n");
  const dlg = page.getByTestId("dlg-newModel");
  await dlg.getByRole("radio", { name: /Chỉ lưới trục/ }).click();
  await page.getByTestId("new-name").fill("Nha_kho");
  await page.getByTestId("new-xs").fill("2@5");
  await page.getByTestId("new-ys").fill("4");
  await page.getByTestId("new-hs").fill("3@3");
  await expect(dlg).toContainText("2 × 1 nhịp, 3 tầng, cao 9.00 m");
  await page.getByTestId("create-model").click();
  await expect(dlg).toHaveCount(0);
  const m = await model(page);
  expect(m.name).toBe("Nha_kho");
  expect(m.frames.length).toBe(0);
  expect(m.stories.length).toBe(4);
  expect(m.grids[0]!.x.map((l) => l.coord)).toEqual([0, 5, 10]);
  await expect(page).toHaveTitle(/Nha_kho/);
});

test("ô nhịp sai thì không cho tạo", async ({ page }) => {
  await page.keyboard.press("Control+n");
  await page.getByTestId("new-xs").fill("6, -2");
  await expect(page.getByTestId("create-model")).toBeDisabled();
});

test("thêm vật liệu từ thư viện, hoàn tác một bước", async ({ page }) => {
  await openDialog(page, "Define", "Vật liệu…");
  const dlg = page.getByTestId("dlg-materials");
  await dlg.getByLabel("Thêm từ thư viện…").selectOption({ label: "B30" });
  await expect(page.getByTestId("define-name")).toHaveValue("B30");
  await page.getByTestId("dialog-ok").click();
  expect((await model(page)).materials.map((m) => m.name)).toEqual(["B25", "CB400-V", "B30"]);
  await page.keyboard.press("Control+z");
  expect((await model(page)).materials.length).toBe(2);
});

test("tạo tiết diện chữ I và xem đặc trưng hình học", async ({ page }) => {
  await openDialog(page, "Define", "Tiết diện thanh…");
  const dlg = page.getByTestId("dlg-frameSections");
  await page.getByTestId("define-add").click();
  await page.getByTestId("define-name").fill("I400");
  await dlg.getByRole("radio", { name: "Chữ I" }).click();
  await page.getByTestId("dim-h").fill("0.5");
  await expect(page.getByTestId("prop-A")).toContainText("m²");
  await page.getByTestId("dialog-ok").click();
  const sec = (await model(page)).frameSections.find((s) => s.name === "I400");
  expect(sec?.geometry).toMatchObject({ shape: "I", h: 0.5 });
});

test("không xoá được tiết diện đang dùng; trùng tên thì báo lỗi", async ({ page }) => {
  await openDialog(page, "Define", "Tiết diện thanh…");
  const dlg = page.getByTestId("dlg-frameSections");
  await expect(dlg.getByRole("button", { name: "Xoá" })).toBeDisabled();
  await page.getByTestId("define-add").click();
  await page.getByTestId("define-name").fill("D300x600");
  await page.getByTestId("dialog-ok").click();
  await expect(dlg.getByRole("alert")).toContainText("đã có");
  await expect(dlg).toBeVisible();
});

test("dời trục B và thêm tầng", async ({ page }) => {
  await openDialog(page, "Define", "Lưới trục…");
  const dlg = page.getByTestId("dlg-gridStory");
  await page.getByTestId("coord-x-B").fill("6.5");
  await page.getByTestId("add-story").click();
  await page.getByTestId("dialog-ok").click();
  await expect(dlg).toHaveCount(0);
  const m = await model(page);
  expect(m.grids[0]!.x[1]!.coord).toBe(6.5);
  expect(m.joints.filter((j) => j.x === 6.5).length).toBe(18);
  expect(m.stories.length).toBe(7);
  expect(m.stories.at(-1)!.elevation).toBeCloseTo(21.9);
});

test("tạo tổ hợp tải", async ({ page }) => {
  await openDialog(page, "Define", "Tổ hợp tải…");
  const dlg = page.getByTestId("dlg-loads");
  await expect(dlg.getByRole("tab", { name: /Tổ hợp/ })).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("define-add").click();
  await page.getByTestId("define-name").fill("ULS1");
  await dlg.getByLabel("Hệ số").first().fill("1.2");
  await page.getByTestId("dialog-ok").click();
  const c = (await model(page)).combos.find((x) => x.name === "ULS1");
  expect(c?.items).toEqual([{ case: "lc-dl", factor: 1.2 }]);
});

test("lưu .nxf rồi mở lại", async ({ page }) => {
  await page.getByTestId("console-input").fill('cmd model.setName {"name":"Du_an_B"}');
  await page.getByTestId("console-input").press("Enter");
  expect((await state(page)).dirty).toBe(true);

  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+s")]);
  expect(download.suggestedFilename()).toBe("Du_an_B.nxf");
  // setFiles của Playwright bỏ qua đường dẫn có dấu tiếng Việt, nên lưu vào thư mục tạm không dấu.
  const path = join(mkdtempSync(join(tmpdir(), "nexfem-e2e-")), "Du_an_B.nxf");
  await download.saveAs(path);
  expect((await state(page)).dirty).toBe(false);

  // Đổi mô hình rồi mở lại file đã lưu.
  await page.keyboard.press("Control+n");
  await page.getByTestId("dlg-newModel").getByRole("radio", { name: /Trống/ }).click();
  await page.getByTestId("create-model").click();
  expect((await model(page)).frames.length).toBe(0);

  // Mô hình mới chưa lưu: xác nhận bỏ thay đổi trước khi mở file đã lưu.
  page.on("dialog", (dialog) => void dialog.accept());
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Control+o")]);
  await chooser.setFiles(path);
  await expect.poll(async () => (await model(page)).name).toBe("Du_an_B");
  expect((await model(page)).frames.length).toBe(145);
  expect(await state(page)).toMatchObject({ dirty: false, fileName: "Du_an_B.nxf", canUndo: false });
});
