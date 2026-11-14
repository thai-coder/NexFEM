import { expect, test, type Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type M = {
  name: string;
  units: { force: string; length: string; temperature: string };
  designCodes?: Record<string, string>;
  stories: { name: string; elevation: number }[];
  grids: { x: { coord: number }[]; y: { coord: number }[] }[];
  joints: unknown[];
  frames: { kind: string }[];
  shells: unknown[];
  frameSections: { id: string }[];
};

const m = (page: Page) =>
  page.evaluate(() => (window as unknown as { __nexfem: { model: { getState(): { model: unknown } } } }).__nexfem.model.getState().model as M);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.clear();
      sessionStorage.setItem("seeded", "1");
    }
  });
  await page.goto("/");
  await expect(page.getByTestId("viewport")).toBeVisible();
  await page.keyboard.press("Control+n");
  await expect(page.getByTestId("dlg-newModel")).toBeVisible();
});

test("hai bước: khởi tạo rồi mẫu nhanh; quay lại giữ nguyên tên", async ({ page }) => {
  await expect(page.getByTestId("new-step1")).toBeVisible();
  await expect(page.getByTestId("new-step2")).toHaveCount(0);
  await expect(page.getByTestId("create-model")).toHaveCount(0);
  await page.getByTestId("new-name").fill("Ten_thu");
  await page.getByTestId("new-next").click();
  await expect(page.getByTestId("new-step2")).toBeVisible();
  for (const k of ["frame", "flatSlab", "flatSlabBeams", "grid", "blank"]) await expect(page.getByTestId(`tpl-${k}`)).toBeVisible();
  await page.getByTestId("new-back").click();
  await expect(page.getByTestId("new-name")).toHaveValue("Ten_thu");
});

test("không qua được bước 1 khi tên rỗng", async ({ page }) => {
  await page.getByTestId("new-name").fill("  ");
  await expect(page.getByTestId("new-next")).toBeDisabled();
});

test("mẫu sàn phẳng: không dầm, có sàn, ghi chú giới hạn và cảnh báo trong log", async ({ page }) => {
  await page.getByTestId("new-next").click();
  await page.getByTestId("tpl-flatSlab").click();
  await expect(page.getByTestId("flat-note")).toContainText("Giai đoạn 9");
  await page.getByTestId("new-xs").fill("2@6");
  await page.getByTestId("new-ys").fill("7");
  await page.getByTestId("new-hs").fill("2@3.6");
  await page.getByTestId("create-model").click();
  const model = await m(page);
  expect(model.frames.length).toBe(3 * 2 * 2);
  expect(model.frames.every((f) => f.kind === "column")).toBe(true);
  expect(model.shells.length).toBe(2 * 1 * 2);
  expect(model.frameSections.map((s) => s.id)).toEqual(["sec-col"]);
  await expect(page.getByTestId("bottom")).toContainText("Phần tử shell cho sàn");
});

test("mẫu sàn phẳng có dầm biên: chỉ có dầm ở chu vi", async ({ page }) => {
  await page.getByTestId("new-next").click();
  await page.getByTestId("tpl-flatSlabBeams").click();
  await page.getByTestId("new-xs").fill("3@6");
  await page.getByTestId("new-ys").fill("2@7");
  await page.getByTestId("new-hs").fill("3.6");
  await page.getByTestId("create-model").click();
  const beams = (await m(page)).frames.filter((f) => f.kind === "beam");
  expect(beams.length).toBe(2 * 3 + 2 * 2);
});

test("lưới đều và tầng đơn giản", async ({ page }) => {
  await page.getByTestId("new-next").click();
  await page.getByTestId("gridmode-uniform").check();
  await page.getByTestId("storymode-simple").check();
  await page.getByTestId("new-xcount").fill("4");
  await page.getByTestId("new-xspacing").fill("5");
  await page.getByTestId("new-ycount").fill("2");
  await page.getByTestId("new-yspacing").fill("6");
  await page.getByTestId("new-scount").fill("4");
  await page.getByTestId("new-stypical").fill("3.5");
  await page.getByTestId("new-sbottom").fill("4.2");
  await expect(page.getByTestId("dlg-newModel")).toContainText("4 × 2 nhịp, 4 tầng, cao 14.70 m");
  await page.getByTestId("create-model").click();
  const model = await m(page);
  expect(model.grids[0]!.x.map((l) => l.coord)).toEqual([0, 5, 10, 15, 20]);
  expect(model.grids[0]!.y.map((l) => l.coord)).toEqual([0, 6, 12]);
  expect(model.stories.map((s) => s.elevation)).toEqual([0, 4.2, 7.7, 11.2, 14.7]);
});

test("giá trị lưới đều sai thì không cho tạo", async ({ page }) => {
  await page.getByTestId("new-next").click();
  await page.getByTestId("gridmode-uniform").check();
  await page.getByTestId("new-xcount").fill("0");
  await expect(page.getByTestId("create-model")).toBeDisabled();
  await page.getByTestId("new-xcount").fill("3");
  await expect(page.getByTestId("create-model")).toBeEnabled();
});

test("lưu thiết lập làm mặc định rồi dùng lại cho mô hình sau", async ({ page }) => {
  await expect(page.getByTestId("init-saved")).toBeDisabled();
  await expect(page.getByTestId("init-saved-summary")).toHaveCount(0);
  await page.getByTestId("new-units").selectOption("tonf, m, C");
  await page.getByTestId("code-concrete").selectOption("EN 1992-1-1");
  await page.getByTestId("init-save-default").check();
  await page.getByTestId("new-next").click();
  await page.getByTestId("tpl-blank").click();
  await page.getByTestId("create-model").click();
  expect((await m(page)).units.force).toBe("tonf");

  // Mô hình vừa tạo chưa lưu: hộp thoại hỏi bỏ thay đổi (trình duyệt dùng window.confirm).
  page.on("dialog", (d) => void d.accept());
  await page.keyboard.press("Control+n");
  const saved = page.getByTestId("init-saved");
  await expect(saved).toBeEnabled();
  await saved.check();
  await expect(page.getByTestId("init-saved-summary")).toContainText("tonf, m, C");
  await expect(page.getByTestId("init-saved-summary")).toContainText("EN 1992-1-1");
  await page.getByTestId("new-next").click();
  await page.getByTestId("tpl-blank").click();
  await page.getByTestId("create-model").click();
  const model = await m(page);
  expect(model.units.force).toBe("tonf");
  expect(model.designCodes).toMatchObject({ concrete: "EN 1992-1-1" });
});

test("lấy đơn vị và tiêu chuẩn từ một file mô hình", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await page.getByTestId("new-units").selectOption("kgf, cm, C");
  await page.getByTestId("code-steel").selectOption("AISC 360-22");
  await page.getByTestId("new-name").fill("Nguon");
  await page.getByTestId("new-next").click();
  await page.getByTestId("tpl-blank").click();
  await page.getByTestId("create-model").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+s")]);
  const path = join(mkdtempSync(join(tmpdir(), "nexfem-e2e-")), "Nguon.nxf");
  await download.saveAs(path);

  await page.keyboard.press("Control+n");
  await page.getByTestId("init-file").check();
  await expect(page.getByTestId("init-file-summary")).toContainText("Chưa chọn file");
  await expect(page.getByTestId("new-next")).toBeDisabled();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("init-pick-file").click()]);
  await chooser.setFiles(path);
  await expect(page.getByTestId("init-file-summary")).toContainText("Nguon.nxf: kgf, cm, C");
  await page.getByTestId("new-name").fill("Ke_thua");
  await page.getByTestId("new-next").click();
  await page.getByTestId("tpl-blank").click();
  await page.getByTestId("create-model").click();
  const model = await m(page);
  expect(model.name).toBe("Ke_thua");
  expect(model.units).toMatchObject({ force: "kgf", length: "cm" });
  expect(model.designCodes).toMatchObject({ steel: "AISC 360-22" });
});

test("sàn phẳng và sàn phẳng có dầm biên vẫn chạy được bộ giải với tải đứng (F5)", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  for (const tpl of ["flatSlab", "flatSlabBeams"]) {
    if (tpl !== "flatSlab") await page.keyboard.press("Control+n");
    await page.getByTestId("new-next").click();
    await page.getByTestId(`tpl-${tpl}`).click();
    await page.getByTestId("new-xs").fill("2@6");
    await page.getByTestId("new-ys").fill("2@6");
    await page.getByTestId("new-hs").fill("2@3.6");
    await page.getByTestId("create-model").click();
    await page.keyboard.press("F5");
    await expect(page.getByTestId("bottom")).toContainText("Phân tích xong");
    await page.keyboard.press("F6");
  }
});
