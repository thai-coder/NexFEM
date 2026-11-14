import { expect, test, type Page } from "@playwright/test";

type Viewer = {
  deformedBounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null;
  momentBounds: { min: { y: number; z: number }; max: { y: number; z: number } } | null;
  deformationAnimationProgress: number | null;
  cameraState: { position: number[]; target: number[] };
  worldToScreen(x: number, y: number, z: number): [number, number];
};

const cantilever = {
  schemaVersion: 1, name: "Cantilever", units: { force: "kN", length: "mm", temperature: "C" },
  grids: [{ id: "g", name: "Grid", x: [{ id: "x0", label: "X0", coord: 0 }], y: [{ id: "y0", label: "Y0", coord: 0 }] }],
  stories: [{ id: "base", name: "Base", elevation: 0, height: 0 }],
  materials: [{ id: "m", name: "Steel", type: "steel", E: 2e8, nu: 0.3, gamma: 0 }],
  frameSections: [{ id: "s", name: "Rect", material: "m", geometry: { shape: "rect", b: 0.2, h: 0.4 } }],
  shellSections: [], shells: [],
  joints: [{ id: "a", label: "A", x: 0, y: 0, z: 0, restraint: [true, true, true, true, true, true] }, { id: "b", label: "B", x: 3, y: 0, z: 0 }],
  frames: [{ id: "f", label: "F", kind: "beam", i: "a", j: "b", section: "s" }],
  loadPatterns: [{ id: "p", name: "P", type: "live", selfWeight: 0 }],
  loadCases: [{ id: "c", name: "C", type: "linearStatic", loads: [{ pattern: "p", factor: 1 }] }],
  combos: [
    { id: "k", name: "K", type: "linearAdd", items: [{ case: "c", factor: 1.5 }] },
    { id: "env", name: "ENV", type: "envelope", items: [{ case: "c", factor: 1 }] },
    { id: "srss", name: "SRSS", type: "srss", items: [{ case: "c", factor: 1 }] },
  ],
  frameLoads: [{ id: "l", frame: "f", pattern: "p", kind: "point", direction: "gravity", value: 10, at: 1 }],
};

const bounds = (page: Page, pane: number) => page.evaluate((index) => {
  const v = (window as unknown as { __nexfemViewers: Viewer[] }).__nexfemViewers[index];
  return v?.deformedBounds ?? null;
}, pane);

async function displayMenu(page: Page, label = "Biến dạng") {
  await page.getByRole("menuitem", { name: "Display", exact: true }).click();
  return page.getByRole("menuitem", { name: label, exact: true });
}

async function openCantilever(page: Page, model = cantilever) {
  await page.getByTestId("toolbar").locator('[data-command="file.open"]').click();
  await page.getByTestId("open-input").setInputFiles({
    name: "cantilever.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(model)),
  });
  await expect(page).toHaveTitle(/cantilever\.json/);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/?sample=1");
  await expect(page.getByTestId("viewport")).toBeVisible();
});

test("biến dạng công xôn theo chuyển vị tổng thể, hệ số và trường hợp tải", async ({ page }) => {
  await expect(await displayMenu(page)).toBeDisabled();
  await openCantilever(page);
  await page.keyboard.press("F5");
  const cases = page.getByTestId("toolbar-result-case");
  await expect(cases).toHaveValue("c");
  await (await displayMenu(page)).click();

  const pane = page.getByTestId("pane-1");
  const scale = pane.getByTestId("deformation-scale");
  const auto = pane.getByRole("button", { name: "Tự động" });
  await expect(auto).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await bounds(page, 1))?.min.z).toBeCloseTo(-0.08 * 3, 3);
  await expect.poll(async () => (await bounds(page, 0))?.min.z).toBe(0);

  const tipUz = (-10 * 3 ** 3) / (3 * 2e8 * (0.2 * 0.4 ** 3 / 12));
  await scale.fill("1");
  await expect.poll(async () => (await bounds(page, 1))?.min.z).toBeCloseTo(tipUz, 8);
  await scale.fill("1000");
  await expect.poll(async () => (await bounds(page, 1))?.min.z).toBeCloseTo(1000 * tipUz, 6);
  const plane = page.getByTestId("pane-0");
  await expect(plane.getByTestId("deformation-scale")).toHaveValue("1000");
  await plane.locator(".pane-title").selectOption("elev:g:y0");
  await expect.poll(async () => (await bounds(page, 0))?.min.z).toBeCloseTo(1000 * tipUz, 6);
  expect((await bounds(page, 0))?.max.y).toBe(0);
  await plane.locator(".pane-title").selectOption("elev:g:x0");
  await expect.poll(() => bounds(page, 0)).toBeNull();
  await expect(plane.getByRole("status")).toContainText("không có thanh có kết quả biến dạng");
  await plane.locator(".pane-title").selectOption("plan:base");
  await expect.poll(async () => (await bounds(page, 0))?.min.z).toBe(0);
  await scale.fill("0");
  await expect(scale).toHaveAttribute("aria-invalid", "true");
  await scale.press("Tab");
  await expect(scale).toHaveValue("1000");

  await pane.getByTestId("preset-front").click();
  const camera = () => page.evaluate(() => (window as unknown as { __nexfemViewers: Viewer[] }).__nexfemViewers[1]!.cameraState);
  const before = await camera();
  await cases.selectOption("k");
  await expect.poll(async () => (await bounds(page, 1))?.min.z).toBeCloseTo(1500 * tipUz, 6);
  expect(await camera()).toEqual(before);
  for (const id of ["env:max", "env:min", "srss"]) {
    await cases.selectOption(id);
    await expect(pane.getByRole("status")).toContainText("tải tĩnh và tổ hợp tuyến tính");
    await expect.poll(() => bounds(page, 1)).toBeNull();
  }
  await cases.selectOption("c");
  await expect.poll(async () => (await bounds(page, 1))?.min.z).toBeCloseTo(1000 * tipUz, 6);
  await (await displayMenu(page)).click();
  await expect.poll(() => bounds(page, 1)).toBeNull();
  await (await displayMenu(page)).click();
  await auto.click();
  await expect.poll(async () => (await bounds(page, 1))?.min.z).toBeCloseTo(-0.24, 3);
  await page.keyboard.press("F6");
  await expect(pane.getByTestId("deformation-controls")).toHaveCount(0);
  await expect.poll(() => bounds(page, 1)).toBeNull();
  await expect.poll(() => bounds(page, 0)).toBeNull();
  await expect(await displayMenu(page)).toBeDisabled();
});

test("biểu đồ M3 khớp toàn bộ station và scale thủ công giữ theo case", async ({ page }) => {
  await expect(await displayMenu(page, "Biểu đồ M3")).toBeDisabled();
  await openCantilever(page);
  await page.keyboard.press("F5");
  const cases = page.getByTestId("toolbar-result-case");
  await expect(cases).toHaveValue("c");
  await (await displayMenu(page, "Biểu đồ M3")).click();
  const pane = page.getByTestId("pane-1");
  const moment = (index: number) => page.evaluate((i) =>
    (window as unknown as { __nexfemViewers: Viewer[] }).__nexfemViewers[i]!.momentBounds, index);
  await expect.poll(async () => (await moment(1))?.max.z).toBeCloseTo(0.18, 6);
  expect(await moment(0)).toBeNull();
  await page.getByTestId("pane-0").locator(".pane-title").selectOption("elev:g:y0");
  await expect.poll(async () => (await moment(0))?.max.z).toBeCloseTo(0.18, 6);
  await pane.getByTestId("moment-scale").fill("0.01");
  await expect.poll(async () => (await moment(1))?.max.z).toBeCloseTo(0.30, 6);

  await pane.getByTestId("preset-front").click();
  const box = (await pane.locator(".pane-canvas").boundingBox())!;
  const point = await page.evaluate(() => (window as unknown as { __nexfemViewers: Viewer[] }).__nexfemViewers[1]!.worldToScreen(1.5, 0, 0));
  await page.mouse.click(box.x + point[0], box.y + point[1]);
  const stationRows = page.getByTestId("moment-stations").locator("tbody tr");
  await expect(stationRows).toHaveCount(9);
  const bottom = page.getByTestId("bottom");
  await bottom.getByRole("tab", { name: /Bảng dữ liệu/ }).click();
  await bottom.getByLabel("Bảng").selectOption("frameForces");
  const forceRows = bottom.locator("tbody tr");
  await expect(forceRows).toHaveCount(9);
  const stationValues = await stationRows.evaluateAll((rows) => rows.map((row) => Array.from(row.querySelectorAll("td"), (cell) => cell.textContent)));
  const forceValues = await forceRows.evaluateAll((rows) => rows.map((row) => {
    const cells = row.querySelectorAll("td");
    return [cells[1]?.textContent, cells[7]?.textContent];
  }));
  expect(stationValues).toEqual(forceValues);
  expect(stationValues[0]).toEqual(["0.000", "-30000.00"]);
  await cases.selectOption("k");
  await expect.poll(async () => (await moment(1))?.max.z).toBeCloseTo(0.45, 6);
  await cases.selectOption("srss");
  await expect(pane.getByTestId("moment-controls")).toContainText("SRSS tải tĩnh");
  await expect.poll(async () => (await moment(1))?.min.z).toBeCloseTo(-0.30, 6);
  await page.keyboard.press("F6");
  await expect(pane.getByTestId("moment-controls")).toHaveCount(0);
  await expect.poll(() => moment(1)).toBeNull();
});

test("chạy và dừng hình biến dạng tĩnh, đổi case đưa hình về trạng thái tĩnh", async ({ page }) => {
  await openCantilever(page);
  await page.keyboard.press("F5");
  const cases = page.getByTestId("toolbar-result-case");
  await expect(cases).toHaveValue("c");
  await (await displayMenu(page)).click();
  const pane = page.getByTestId("pane-1");
  const progress = () => page.evaluate(() => (window as unknown as { __nexfemViewers: Viewer[] }).__nexfemViewers[1]!.deformationAnimationProgress);
  await pane.getByRole("button", { name: "Chạy biến dạng" }).click();
  await expect(pane.getByRole("button", { name: "Dừng biến dạng" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await progress()) ?? 1).toBeLessThan(0.8);
  await pane.getByRole("button", { name: "Dừng biến dạng" }).click();
  await expect.poll(progress).toBeNull();
  await expect.poll(async () => (await bounds(page, 1))?.min.z).toBeCloseTo(-0.24, 3);
  await pane.getByRole("button", { name: "Chạy biến dạng" }).click();
  await cases.selectOption("k");
  await expect(pane.getByRole("button", { name: "Chạy biến dạng" })).toBeVisible();
  await expect.poll(progress).toBeNull();
  await pane.getByRole("button", { name: "Chạy biến dạng" }).click();
  await (await displayMenu(page, "Biểu đồ M3")).click();
  await expect(pane.getByTestId("moment-controls")).toBeVisible();
  await expect.poll(progress).toBeNull();
});

test("biểu đồ M2 của công xôn chịu tải ngang, đổi M2/M3 giữ scale và case", async ({ page }) => {
  await expect(await displayMenu(page, "Biểu đồ M2")).toBeDisabled();
  await openCantilever(page, {
    ...cantilever,
    frameLoads: [...cantilever.frameLoads, { id: "ly", frame: "f", pattern: "p", kind: "point", direction: "globalY", value: 10, at: 1 }],
  });
  await page.keyboard.press("F5");
  const cases = page.getByTestId("toolbar-result-case");
  await expect(cases).toHaveValue("c");
  await (await displayMenu(page, "Biểu đồ M2")).click();

  const moment = (index: number) => page.evaluate((i) =>
    (window as unknown as { __nexfemViewers: Viewer[] }).__nexfemViewers[i]!.momentBounds, index);
  const plan = page.getByTestId("pane-0");
  const pane = page.getByTestId("pane-1");
  const controls = pane.getByTestId("moment-controls");
  const scale = controls.getByTestId("moment-scale");
  await expect(controls).toContainText("Biểu đồ M2");
  await expect.poll(async () => (await moment(1))?.min.y).toBeCloseTo(-0.18, 6);
  await expect.poll(async () => (await moment(0))?.min.y).toBeCloseTo(-0.18, 6);
  await plan.locator(".pane-title").selectOption("elev:g:y0");
  await expect.poll(() => moment(0)).toBeNull();
  await expect(plan.getByRole("status")).toContainText("M2");

  await scale.fill("0.01");
  await expect.poll(async () => (await moment(1))?.min.y).toBeCloseTo(-0.30, 6);
  await pane.getByTestId("preset-front").click();
  const canvas = (await pane.locator(".pane-canvas").boundingBox())!;
  const point = await page.evaluate(() => (window as unknown as { __nexfemViewers: Viewer[] }).__nexfemViewers[1]!.worldToScreen(1.5, 0, 0));
  await page.mouse.click(canvas.x + point[0], canvas.y + point[1]);
  const stations = page.getByRole("table", { name: "M2 tại các điểm tính" });
  const rows = stations.locator("tbody tr");
  await expect(rows).toHaveCount(9);
  const values = await rows.evaluateAll((items) => items.map((row) =>
    Array.from(row.querySelectorAll("td"), (cell) => Number(cell.textContent))));
  values.forEach(([x, m2], k) => {
    const station = 3 * k / 8;
    expect(x).toBeCloseTo(1000 * station, 3);
    expect(m2).toBeCloseTo(1000 * 10 * (3 - station), 2);
  });

  await cases.selectOption("k");
  await expect.poll(async () => (await moment(1))?.min.y).toBeCloseTo(-0.45, 6);
  await (await displayMenu(page, "Biểu đồ M3")).click();
  await expect(controls).toContainText("Biểu đồ M3");
  await expect(scale).toHaveValue("0.01");
  await expect(cases).toHaveValue("k");
  await expect.poll(async () => (await moment(1))?.max.z).toBeCloseTo(0.45, 6);
  await (await displayMenu(page, "Biểu đồ M2")).click();
  await expect.poll(async () => (await moment(1))?.min.y).toBeCloseTo(-0.45, 6);
  await controls.getByRole("button", { name: "Tự động" }).click();
  await expect.poll(async () => (await moment(1))?.min.y).toBeCloseTo(-0.18, 6);
  await page.keyboard.press("F6");
  await expect(controls).toHaveCount(0);
  await expect.poll(() => moment(1)).toBeNull();
});

test("lớp biến dạng dùng được với 1/2/4 ô và giữ thao tác trên mô hình gốc", async ({ page }) => {
  await page.keyboard.press("F5");
  await expect(page.getByTestId("toolbar-result-case")).toHaveValue("lc-dl");
  await page.keyboard.press("Control+1");
  await (await displayMenu(page)).click();
  const pane = page.getByTestId("pane-0");
  await expect(pane.locator(".pane-title")).toHaveValue("plan:story-3");
  await expect.poll(() => bounds(page, 0)).not.toBeNull();
  const planCanvas = (await pane.locator(".pane-canvas").boundingBox())!;
  const planPoint = await page.evaluate(() => (window as unknown as { __nexfemViewers: Viewer[] }).__nexfemViewers[0]!.worldToScreen(3, 0, 11.1));
  await page.mouse.click(planCanvas.x + planPoint[0], planCanvas.y + planPoint[1]);
  await expect(page.getByTestId("selection-count")).toHaveText("1 đã chọn");
  await page.keyboard.press("Control+2");
  await expect.poll(() => bounds(page, 1)).not.toBeNull();
  await page.keyboard.press("Control+4");
  await expect(page.getByTestId("pane-3")).toBeVisible();
  await expect(page.getByTestId("deformation-controls")).toHaveCount(4);
  await expect.poll(async () => (await bounds(page, 2))?.min.x).toBe(6);

  await page.keyboard.press("Control+1");
  await pane.locator(".pane-title").selectOption("3d");
  await pane.getByTestId("preset-front").click();
  const canvas = (await pane.locator(".pane-canvas").boundingBox())!;
  const at = await page.evaluate(() => (window as unknown as { __nexfemViewers: Viewer[] }).__nexfemViewers[0]!.worldToScreen(3, 0, 11.1));
  await page.mouse.click(canvas.x + at[0], canvas.y + at[1]);
  await expect(page.getByTestId("selection-count")).toHaveText("1 đã chọn");

  const camera = () => page.evaluate(() => (window as unknown as { __nexfemViewers: Viewer[] }).__nexfemViewers[0]!.cameraState);
  const x = canvas.x + canvas.width / 2;
  const y = canvas.y + canvas.height / 2;
  await page.mouse.move(x, y);
  const original = await camera();
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await camera()).position).not.toEqual(original.position);
  const zoomed = await camera();
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(x + 35, y + 20, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  await expect.poll(async () => (await camera()).target).not.toEqual(zoomed.target);
  const panned = await camera();
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x + 80, y + 40, { steps: 4 });
  await page.mouse.up({ button: "right" });
  await expect.poll(async () => (await camera()).position).not.toEqual(panned.position);
  await expect.poll(() => bounds(page, 0)).not.toBeNull();

  await page.keyboard.press("Control+n");
  await page.getByTestId("new-next").click();
  await page.getByTestId("create-model").click();
  await expect(page.getByTestId("deformation-controls")).toHaveCount(0);
  await expect.poll(() => bounds(page, 0)).toBeNull();
});
