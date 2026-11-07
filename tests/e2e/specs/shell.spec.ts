import { expect, test, type Page } from "@playwright/test";

type NexState = {
  model: { getState(): { model: { frames: { id: string; label: string; section: string; kind: string; i: string; j: string }[]; joints: { id: string; x: number; y: number; z: number }[] }; selection: string[] } };
  ui: { getState(): { layout: number; theme: string; logs: { text: string; source?: string }[] } };
};

async function state<T>(page: Page, fn: (n: NexState) => T): Promise<T> {
  return page.evaluate((src) => {
    const n = (window as unknown as { __nexfem: NexState }).__nexfem;
    return new Function("n", `return (${src})(n)`)(n) as T;
  }, fn.toString());
}

/** Toạ độ màn hình (trang) của một điểm mô hình trong ô viewport thứ `pane`. */
async function screenOf(page: Page, pane: number, p: [number, number, number]) {
  const local = await page.evaluate(
    ([pane, p]) => {
      const v = (window as unknown as { __nexfemViewers: { worldToScreen(x: number, y: number, z: number): [number, number] }[] }).__nexfemViewers[pane as number]!;
      const [x, y, z] = p as [number, number, number];
      return v.worldToScreen(x, y, z);
    },
    [pane, p] as const,
  );
  const box = (await page.getByTestId(`pane-${pane}`).locator(".pane-canvas").boundingBox())!;
  return { x: box.x + local[0], y: box.y + local[1] };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await expect(page.getByTestId("viewport")).toBeVisible();
  await page.waitForFunction(() => ((window as unknown as { __nexfemViewers?: unknown[] }).__nexfemViewers?.length ?? 0) >= 2);
});

test("mở app: đủ menu, ribbon, panel và không có lỗi", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.reload();
  await expect(page.getByRole("menuitem", { name: "Analyze" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Mô hình" })).toBeVisible();
  await expect(page.getByTestId("explorer")).toBeVisible();
  await expect(page.getByTestId("properties")).toContainText("Tóm tắt mô hình");
  await expect(page.getByTestId("bottom")).toContainText("NexFEM sẵn sàng");
  await expect(page).toHaveTitle(/NexFEM — Toa_nha_A/);
  expect(errors).toEqual([]);
});

test("bấm chọn dầm trên mặt bằng, đổi tiết diện, rồi hoàn tác", async ({ page }) => {
  // Dầm trục 1 giữa A và B ở Tầng 3 (z = 11.1).
  const at = await screenOf(page, 0, [3, 0, 11.1]);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId("selection-count")).toHaveText("1 đã chọn");
  const props = page.getByTestId("properties");
  await expect(props).toContainText("Dầm");
  await page.getByTestId("section-select").selectOption({ label: "C400x400" });
  await page.getByTestId("apply").click();
  const sel = await state(page, (n) => {
    const s = n.model.getState();
    return s.model.frames.find((f) => f.id === s.selection[0])!.section;
  });
  expect(sel).toBe("sec-col");
  await page.keyboard.press("Control+z");
  const after = await state(page, (n) => {
    const s = n.model.getState();
    return s.model.frames.find((f) => f.id === s.selection[0])!.section;
  });
  expect(after).toBe("sec-beam");
});

test("kéo khung chọn trên mặt bằng", async ({ page }) => {
  const a = await screenOf(page, 0, [-1, -1, 11.1]);
  const b = await screenOf(page, 0, [7, 8, 11.1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  const n = await state(page, (n) => n.model.getState().selection.length);
  // Ô A-B / 1-2: 4 dầm, 1 sàn, 4 cột tại góc, 4 nút.
  expect(n).toBe(13);
});

test("Console vẽ dầm và chọn theo nhãn", async ({ page }) => {
  const before = await state(page, (n) => n.model.getState().model.frames.length);
  const input = page.getByTestId("console-input");
  await input.fill("beam 0,0 6,7.2");
  await input.press("Enter");
  await expect.poll(() => state(page, (n) => n.model.getState().model.frames.length)).toBe(before + 1);
  await input.fill("select C1");
  await input.press("Enter");
  await expect(page.getByTestId("properties")).toContainText("Cột C1");
});

test("chạy kiểm tra mô hình và phân tích (F5)", async ({ page }) => {
  await page.keyboard.press("F5");
  await expect(page.getByTestId("bottom")).toContainText("Phân tích xong: 72 nút, 145 thanh, 360 bậc tự do");
});

test("đổi theme, ngôn ngữ, bố cục và ẩn panel", async ({ page }) => {
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "VI" }).click();
  await expect(page.getByRole("tab", { name: "Modeling" })).toBeVisible();
  await page.keyboard.press("Control+4");
  await expect(page.getByTestId("pane-3")).toBeVisible();
  await page.keyboard.press("F2");
  await expect(page.getByTestId("explorer")).toHaveCount(0);
  await page.keyboard.press("F2");
  await expect(page.getByTestId("explorer")).toBeVisible();
});

test("command palette", async ({ page }) => {
  await page.keyboard.press("Control+Shift+P");
  await page.getByPlaceholder("Tìm lệnh theo tên…").fill("bo cuc 1");
  await page.keyboard.press("Enter");
  await expect.poll(() => state(page, (n) => n.ui.getState().layout)).toBe(1);
});

test("xoay 3D bằng chuột phải và nút hướng nhìn nhanh", async ({ page }) => {
  const cam = () =>
    page.evaluate(() => (window as unknown as { __nexfemViewers: { cameraState: { position: number[]; target: number[] } }[] }).__nexfemViewers[1]!.cameraState);
  const before = await cam();
  const box = (await page.getByTestId("pane-1").locator(".pane-canvas").boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x + 120, y + 30, { steps: 6 });
  await page.mouse.up({ button: "right" });
  const after = await cam();
  expect(after.position).not.toEqual(before.position);
  await page.getByTestId("preset-top").click();
  const top = await cam();
  // Nhìn từ trên: camera cao hơn hẳn tâm, gần như thẳng đứng.
  expect(top.position[2]! - top.target[2]!).toBeGreaterThan(10);
  expect(Math.abs(top.position[0]! - top.target[0]!)).toBeLessThan(0.01);
});
