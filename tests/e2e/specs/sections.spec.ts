import { expect, test, type Page } from "@playwright/test";

type Sec = { name: string; geometry: Record<string, unknown> };
const sections = (page: Page) =>
  page.evaluate(() => (window as unknown as { __nexfem: { model: { getState(): { model: { frameSections: Sec[] } } } } }).__nexfem.model.getState().model.frameSections);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await expect(page.getByTestId("viewport")).toBeVisible();
});

test("tiết diện thép cán: nhập bán kính lượn chân r làm tăng A và được lưu vào mô hình", async ({ page }) => {
  await page.getByRole("menuitem", { name: "Define", exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Tiết diện thanh…" }).click();
  const dlg = page.getByTestId("dlg-frameSections");
  await page.getByTestId("define-add").click();
  await page.getByTestId("define-name").fill("IPE300");
  await dlg.getByRole("radio", { name: "Chữ I" }).click();
  for (const [k, v] of [["h", "0.3"], ["bf", "0.15"], ["tf", "0.0107"], ["tw", "0.0071"]] as const) await page.getByTestId(`dim-${k}`).fill(v);
  await expect(page.getByTestId("dim-r")).toHaveValue("0");
  const without = await page.getByTestId("prop-A").textContent();
  await page.getByTestId("dim-r").fill("0.015");
  await expect(page.getByTestId("prop-A")).not.toHaveText(without ?? "");
  await page.getByTestId("dialog-ok").click();
  const sec = (await sections(page)).find((s) => s.name === "IPE300");
  expect(sec?.geometry).toMatchObject({ shape: "I", h: 0.3, bf: 0.15, tf: 0.0107, tw: 0.0071, r: 0.015 });
});
