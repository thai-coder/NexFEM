import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/?sample=1");
  await expect(page.getByTestId("viewport")).toBeVisible();
  await page.getByTestId("explorer").getByRole("tab", { name: "Reports" }).click();
});

test("tab Reports liệt kê 5 báo cáo; mở báo cáo tiết diện có đặc trưng hình học", async ({ page }) => {
  const explorer = page.getByTestId("explorer");
  for (const name of ["Tóm tắt mô hình", "Vật liệu", "Tiết diện thanh", "Tầng", "Mẫu tải, trường hợp và tổ hợp"]) {
    await expect(explorer.getByText(name, { exact: true })).toBeVisible();
  }
  await explorer.getByText("Tiết diện thanh", { exact: true }).click();
  const dlg = page.getByTestId("dlg-report");
  await expect(dlg).toBeVisible();
  const table = page.getByTestId("report-table");
  await expect(table.locator("th").nth(3)).toHaveText("A (m²)");
  await expect(table.locator("tbody tr").first()).toContainText("Rect");
  // Cột C400x400: A = 0,16 m².
  await expect(table).toContainText("0.16");
  await page.getByTestId("dialog-ok").click();
  await expect(dlg).toHaveCount(0);
});

test("báo cáo tóm tắt có số nút và số thanh đúng", async ({ page }) => {
  await page.getByTestId("explorer").getByText("Tóm tắt mô hình", { exact: true }).click();
  const table = page.getByTestId("report-table");
  const nums = await page.evaluate(() => {
    const m = (window as unknown as { __nexfem: { model: { getState(): { model: { joints: unknown[]; frames: unknown[] } } } } }).__nexfem.model.getState().model;
    return { joints: m.joints.length, frames: m.frames.length };
  });
  await expect(table.locator("tr", { hasText: "Nút" }).first()).toContainText(String(nums.joints));
  await expect(table.locator("tr", { hasText: "Thanh" }).first()).toContainText(String(nums.frames));
});

test("xuất CSV: tải xuống file UTF-8 có BOM và đúng tiêu đề cột", async ({ page }) => {
  await page.getByTestId("explorer").getByText("Tầng", { exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("report-csv").click()]);
  expect(download.suggestedFilename()).toMatch(/-stories\.csv$/);
  const path = join(mkdtempSync(join(tmpdir(), "nexfem-e2e-")), "stories.csv");
  await download.saveAs(path);
  const text = readFileSync(path, "utf8");
  expect(text.startsWith("﻿")).toBe(true);
  const lines = text.replace("﻿", "").trim().split("\r\n");
  expect(lines[0]).toBe("Tên,Cao độ (m),Cao tầng (m),Nút,Thanh,Sàn/vách");
  expect(lines.length).toBe(7); // 6 tầng (Base + 5) + dòng tiêu đề
});

test("lọc theo tên trong tab Reports", async ({ page }) => {
  await page.getByPlaceholder("Lọc theo tên, nhãn…").fill("vật liệu");
  const explorer = page.getByTestId("explorer");
  await expect(explorer.getByText("Vật liệu", { exact: true })).toBeVisible();
  await expect(explorer.getByText("Tầng", { exact: true })).toHaveCount(0);
});
