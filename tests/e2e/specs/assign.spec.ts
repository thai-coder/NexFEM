import { expect, test, type Page } from "@playwright/test";

type M = {
  joints: { id: string; label: string; z: number; restraint?: boolean[] }[];
  frames: { id: string; label: string; kind: string; section: string; offsets?: { i: number; j: number }; releases?: { i: boolean[]; j: boolean[] } }[];
  diaphragms?: { id: string; name: string; master: string; slaves: string[] }[];
  shells: { id: string }[];
  frameLoads: { frame: string; pattern: string; value: number }[];
  shellLoads: { shell: string; pattern: string; value: number }[];
};
type W = { __nexfem: { model: { getState(): { model: M; select(ids: string[]): void } }; ui: { getState(): { loadDisplay: string | null } } } };

const model = (page: Page) => page.evaluate(() => (window as unknown as W).__nexfem.model.getState().model);
const select = (page: Page, fn: string) =>
  page.evaluate((src) => {
    const s = (window as unknown as W).__nexfem.model.getState();
    s.select((new Function("m", `return (${src})(m)`) as (m: M) => string[])(s.model));
  }, fn);

async function menu(page: Page, item: string) {
  await page.getByRole("menuitem", { name: "Assign", exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: item }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/?sample=1");
  await expect(page.getByTestId("viewport")).toBeVisible();
});

test("không chọn gì: báo và khoá nút OK", async ({ page }) => {
  await menu(page, "Liên kết gối…");
  await expect(page.getByTestId("dlg-assignRestraint")).toContainText("Chưa chọn nút nào");
  await expect(page.getByTestId("dialog-ok")).toBeDisabled();
});

test("gán gối khớp cho các nút chân cột", async ({ page }) => {
  await select(page, "(m) => m.joints.filter((j) => j.restraint).map((j) => j.id)");
  await menu(page, "Liên kết gối…");
  await expect(page.getByTestId("dlg-assignRestraint")).toContainText("Áp dụng cho 12 nút");
  await page.getByRole("button", { name: "Khớp" }).click();
  await page.getByTestId("dialog-ok").click();
  const m = await model(page);
  expect(m.joints.filter((j) => j.restraint).every((j) => j.restraint!.join() === "true,true,true,false,false,false")).toBe(true);
});

test("gán tải phân bố lên dầm và hiện mẫu tải", async ({ page }) => {
  await select(page, "(m) => m.frames.filter((f) => f.kind === 'beam').slice(0, 3).map((f) => f.id)");
  await menu(page, "Tải trên thanh…");
  await page.getByTestId("load-value").fill("12");
  await page.getByTestId("dialog-ok").click();
  const m = await model(page);
  expect(m.frameLoads.map((l) => [l.pattern, l.value])).toEqual([
    ["lp-sdl", 12],
    ["lp-sdl", 12],
    ["lp-sdl", 12],
  ]);
  expect(await page.evaluate(() => (window as unknown as W).__nexfem.ui.getState().loadDisplay)).toBe("lp-sdl");
});

test("nhả liên kết: khớp hai đầu; nhả xoắn hai đầu thì báo lỗi", async ({ page }) => {
  await select(page, "(m) => [m.frames.find((f) => f.label === 'B1').id]");
  await menu(page, "Nhả liên kết…");
  const dlg = page.getByTestId("dlg-assignReleases");
  await page.getByTestId("rel-i-T").check();
  await page.getByTestId("rel-j-T").check();
  await page.getByTestId("dialog-ok").click();
  await expect(dlg.getByRole("alert")).toContainText("mất ổn định");
  await page.getByTestId("rel-j-T").uncheck();
  await page.getByTestId("dialog-ok").click();
  await expect(dlg).toHaveCount(0);
  const b1 = (await model(page)).frames.find((f) => f.label === "B1")!;
  expect(b1.releases?.i).toEqual([false, false, false, true, true, true]);
  expect(b1.releases?.j).toEqual([false, false, false, false, true, true]);
});

test("gán tải sàn và tiết diện", async ({ page }) => {
  await select(page, "(m) => [m.shells[0].id]");
  await menu(page, "Tải trên sàn…");
  await page.getByTestId("load-value").fill("5");
  await page.getByTestId("dialog-ok").click();
  const m = await model(page);
  expect(m.shellLoads.filter((l) => l.shell === m.shells[0]!.id && l.pattern === "lp-ll").map((l) => l.value)).toEqual([5]);

  await select(page, "(m) => m.frames.filter((f) => f.kind === 'beam').slice(0, 2).map((f) => f.id)");
  await menu(page, "Tiết diện thanh…");
  await page.getByTestId("dlg-assignSection").getByLabel("Tiết diện").selectOption({ label: "C400x400" });
  await page.getByTestId("dialog-ok").click();
  const m2 = await model(page);
  expect(m2.frames.filter((f) => f.kind === "beam").slice(0, 2).map((f) => f.section)).toEqual(["sec-col", "sec-col"]);
});

test("Assign rigid zones lưu đúng chiều dài i/j", async ({ page }) => {
  await select(page, "(m) => [m.frames.find((f) => f.label === 'B1').id]");
  await menu(page, "Vùng cứng đầu thanh…");
  await page.getByTestId("offset-i").fill("0.25");
  await page.getByTestId("offset-j").fill("0.3");
  await page.getByTestId("dialog-ok").click();
  expect((await model(page)).frames.find((f) => f.label === "B1")?.offsets).toEqual({ i: 0.25, j: 0.3 });
});

test("Assign diaphragm từ hai nút cùng cao độ", async ({ page }) => {
  await select(page, "(m) => m.joints.filter((j) => j.z > 0).slice(0, 2).map((j) => j.id)");
  const ids = (await model(page)).joints.filter((j) => j.z > 0).slice(0, 2).map((j) => j.id);
  await menu(page, "Diaphragm tuyệt đối cứng…");
  await page.getByTestId("diaphragm-name").fill("D_TEST");
  await page.getByTestId("diaphragm-master").selectOption(ids[0]!);
  await page.getByTestId("dialog-ok").click();
  expect((await model(page)).diaphragms?.[0]).toMatchObject({ name: "D_TEST", master: ids[0], slaves: [ids[1]] });
  await menu(page, "Diaphragm tuyệt đối cứng…");
  await page.getByTestId("diaphragm-remove").click();
  expect((await model(page)).diaphragms).toEqual([]);
});
