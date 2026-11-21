import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const FIXTURE = fileURLToPath(new URL("../../fixtures/csi/etabs/23217_SMFs 3D model_updated v4.e2k", import.meta.url));
const MOMENT = fileURLToPath(new URL("../../fixtures/csi/synthetic/etabs-interior-moment.e2k", import.meta.url));
const SAP = (name: string) => fileURLToPath(new URL(`../../fixtures/csi/sap2000/${name}`, import.meta.url));
type M = { name: string; frames: { kind: string; label: string; angle?: number }[]; joints: unknown[]; shells: unknown[]; combos: unknown[]; jointLoads: unknown[]; frameLoads: { kind: string }[] };
const model = (page: Page) => page.evaluate(() => (window as unknown as { __nexfem: { model: { getState(): { model: unknown } } } }).__nexfem.model.getState().model as M);

/** File → Nhập file → mục của chương trình (menu con, mỗi định dạng một mục riêng). */
async function importFixture(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer } = FIXTURE, item = "ETABS (.e2k)…") {
  await page.getByRole("menuitem", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Nhập file" }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menu", { name: "Nhập file" }).getByRole("menuitem", { name: item }).click()]);
  await chooser.setFiles(file);
  await expect(page.getByTestId("dlg-csiImport")).toBeVisible();
}

test("SAP2000 bỏ bảng tải: báo lỗi và chặn mở mô hình", async ({ page }) => {
  const source = readFileSync(SAP("Roof_model.2k"), "utf8");
  const text = source.replace("END TABLE DATA", 'TABLE:  "AREA LOADS - UNIFORM TO FRAME"\r\n   Area=1 LoadPat=DEAD UnifLoad=1\r\nEND TABLE DATA');
  await importFixture(page, { name: "unsupported-load.s2k", mimeType: "text/plain", buffer: Buffer.from(text) }, "SAP2000 (.s2k, .$2k)…");
  await expect(page.getByTestId("csi-error")).toContainText("AREA LOADS - UNIFORM TO FRAME");
  await expect(page.getByTestId("dlg-csiImport")).toContainText("Không thể mở mô hình vì có lỗi nhập");
  await expect(page.getByTestId("csi-open")).toBeDisabled();
  expect((await model(page)).name).toBe("Toa_nha_A");
});

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
  await expect(counts.locator("tr", { hasText: "Thanh (theo tầng)" })).toHaveText(/322\s*322/);
  await expect(counts.locator("tr", { hasText: "Tải tập trung tại nút" })).toHaveText(/31\s*31/);
  const errors = page.getByTestId("csi-error");
  await expect(page.getByTestId("csi-warning")).toContainText("đổi thành tải tập trung trên thanh");
  await expect(errors).toContainText("Tải hình thang hoặc trên một đoạn thanh chưa hỗ trợ");
  await expect(page.getByTestId("csi-open")).toBeDisabled();
  await expect(page.getByTestId("csi-info")).toContainText("Chia 87 thanh thành 287 đoạn");
  await expect(page.getByTestId("csi-warning")).toContainText("Lò xo nền dưới sàn quy về lò xo nút");
  await expect(page.getByTestId("csi-warning")).not.toContainText("Góc xoay");
  await expect(page.getByTestId("csi-info")).toContainText("Góc xoay trục địa phương của thanh được nhập");
  // Chưa mở: mô hình hiện tại không đổi.
  expect((await model(page)).name).toBe("Toa_nha_A");
});

/**
 * Biến thể DẪN XUẤT của file ETABS thật (không ghi ra repo): bỏ 9 tải hình thang/một đoạn mà NexFEM chưa biểu diễn được,
 * để kiểm tra đường nhập → mở → giải trên mô hình thật. Mô hình này thiếu 9 tải đó nên KHÔNG tương đương mô hình ETABS.
 */
function etabsWithoutPartialLoads() {
  const lines = readFileSync(FIXTURE, "latin1").split("\r\n");
  const partial = (l: string) => {
    const m = /LINELOAD .*TYPE "TRAPF".*FSTART (\S+)\s+FEND (\S+)\s+RDSTART (\S+)\s+RDEND (\S+)/.exec(l);
    return !!m && (m[1] !== m[2] || Number(m[3]) > 1e-9 || Number(m[4]) < 1 - 1e-9);
  };
  const kept = lines.filter((l) => !partial(l));
  expect(lines.length - kept.length).toBe(9);
  return { name: "23217_SMFs 3D model_updated v4.e2k", mimeType: "text/plain", buffer: Buffer.from(kept.join("\r\n"), "latin1") };
}

test("mở mô hình ETABS thật (bỏ tải không đều); lò xo làm gối; F5 chạy được, cơ cấu không chịu tải được ổn định hoá có cảnh báo", async ({ page }) => {
  await importFixture(page, etabsWithoutPartialLoads());
  await expect(page.getByTestId("csi-error")).toHaveCount(0);
  await page.getByTestId("csi-open").click();
  await expect(page.getByTestId("dlg-csiImport")).toHaveCount(0);
  const m = await model(page);
  expect(m.name).toBe("23217_SMFs 3D model_updated v4");
  const host = (label: string) => label.replace(/-\d+$/, "");
  expect(new Set(m.frames.filter((f) => f.kind === "beam").map((f) => host(f.label))).size).toBe(244);
  expect(new Set(m.frames.filter((f) => f.kind === "column").map((f) => host(f.label))).size).toBe(54);
  expect(m.frames.filter((f) => f.kind === "brace").length).toBe(24);
  expect(m.shells.length).toBe(29);
  expect(m.combos.length).toBe(87);
  expect(m.jointLoads.length).toBe(8);
  expect(m.frameLoads.filter((l) => l.kind === "point").length).toBe(23);
  await expect(page.getByTestId("bottom")).toContainText("Đã nhập 23217_SMFs 3D model_updated v4.e2k");
  await page.keyboard.press("F5");
  // Nút 253 chỉ nối các thanh khớp nằm trong mặt phẳng x = const: không có gì giữ theo X (sàn cứng D1 có định nghĩa nhưng
  // không gán). Bậc tự do đó không chịu tải nên được thêm độ cứng rất nhỏ, có cảnh báo liệt kê nút.
  await expect(page.getByTestId("bottom")).toContainText("Phân tích xong", { timeout: 60_000 });
  await expect(page.getByTestId("bottom")).toContainText("253 Ux");
  await expect(page.getByTestId("bottom")).toContainText("không có ý nghĩa");
});

test("ETABS thiếu mẫu tải: lỗi ở báo cáo và không mở mô hình", async ({ page }) => {
  const text = readFileSync(MOMENT, "utf8").replace('LOADPAT "MOMENT" SF 1', 'LOADPAT "MISSING" SF 1');
  await importFixture(page, { name: "missing.e2k", mimeType: "text/plain", buffer: Buffer.from(text) });
  await expect(page.getByTestId("csi-error")).toContainText("MISSING");
  await expect(page.getByTestId("csi-open")).toBeDisabled();
  expect((await model(page)).name).toBe("Toa_nha_A");
});

test("Huỷ thì không đổi mô hình", async ({ page }) => {
  await importFixture(page);
  await page.getByRole("button", { name: "Huỷ" }).click();
  await expect(page.getByTestId("dlg-csiImport")).toHaveCount(0);
  expect((await model(page)).name).toBe("Toa_nha_A");
});

test("mô men giữa công xôn ETABS: nhập, phân tích và đối chiếu với lời giải giải tích", async ({ page }) => {
  await importFixture(page, MOMENT);
  await expect(page.getByTestId("csi-error")).toHaveCount(0);
  await expect(page.getByTestId("csi-info")).toContainText("Đã chia thanh ETABS để đặt mô men tập trung");
  await page.getByTestId("csi-open").click();
  const m = await model(page);
  expect(m.frames.map((f) => f.label)).toEqual(["B1-1", "B1-2"]);

  await page.keyboard.press("F5");
  const bottom = page.getByTestId("bottom");
  await expect(bottom).toContainText("Phân tích xong");
  await bottom.getByRole("tab", { name: /Bảng dữ liệu/ }).click();
  const table = bottom.getByLabel("Bảng");
  await table.selectOption("reactions");
  const base = bottom.getByRole("row").filter({ has: page.getByRole("cell", { name: "A", exact: true }) });
  await expect(base.getByRole("cell").nth(5)).toHaveText("-12.000");
  expect(Math.abs(Number(await base.getByRole("cell").nth(3).innerText()))).toBe(0);

  // u_z(L) = −M·a·(L−a/2)/(E·I), L = 6 m, a = 3 m, I = 0.4⁴/12 m⁴.
  await table.selectOption("displacements");
  const tip = bottom.getByRole("row").filter({ has: page.getByRole("cell", { name: "B", exact: true }) });
  await expect(tip.getByRole("cell").nth(3)).toHaveText("-2.531");
});

test("menu Nhập file: mỗi định dạng một mục riêng, DXF/IFC/Excel để giai đoạn sau", async ({ page }) => {
  await page.getByRole("menuitem", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Nhập file" }).hover();
  const sub = page.getByRole("menu", { name: "Nhập file" });
  await expect(sub.getByRole("menuitem")).toHaveText([/ETABS \(\.e2k\)…/, /SAP2000 \(\.s2k, \.\$2k\)…/, /DXF…/, /IFC…/, /Excel…/]);
  await expect(sub.getByRole("menuitem", { name: /DXF/ })).toContainText("GĐ 8");
});

test("file SAP2000 thật có tải tự động chưa hỗ trợ: báo cáo và chặn mở", async ({ page }) => {
  await importFixture(page, SAP("24061_OMF.s2k"), "SAP2000 (.s2k, .$2k)…");
  await expect(page.getByTestId("dlg-csiImport")).toContainText("Nhập file SAP2000");
  await expect(page.getByTestId("csi-source")).toContainText("SAP2000 23.1.0");
  await expect(page.getByTestId("csi-source")).toContainText("LB, FT");
  await expect(page.getByTestId("csi-error")).toContainText("Mẫu tải dùng tải tự động ASCE 7-16");
  await expect(page.getByTestId("csi-info")).toContainText("Góc xoay trục địa phương của thanh được nhập");
  await expect(page.getByTestId("csi-open")).toBeDisabled();
  expect((await model(page)).name).toBe("Toa_nha_A");
});

test("mở mô hình SAP2000 thật (tải tự động đặt về None); F5 chạy được", async ({ page }) => {
  // Biến thể DẪN XUẤT (không ghi ra repo): 36 mẫu tải AutoLoad="ASCE 7-16" đổi thành None để kiểm tra đường nhập → mở → giải.
  // Tải tự động của SAP2000 không có trong mô hình này, nên KHÔNG tương đương mô hình SAP2000.
  const source = readFileSync(SAP("24061_OMF.s2k"), "utf8");
  const text = source.replaceAll('AutoLoad="ASCE 7-16"', "AutoLoad=None");
  expect(text).not.toBe(source);
  await importFixture(page, { name: "24061_OMF.s2k", mimeType: "text/plain", buffer: Buffer.from(text, "utf8") }, "SAP2000 (.s2k, .$2k)…");
  await expect(page.getByTestId("csi-error")).toHaveCount(0);
  await page.getByTestId("csi-open").click();
  const m = await model(page);
  expect(m.name).toBe("24061_OMF");
  expect(m.frames.map((f) => f.kind)).toEqual(["column", "column", "beam"]);
  expect(m.frames.map((f) => f.angle)).toEqual([90, 90, undefined]);
  expect(m.combos.length).toBe(87);
  expect(m.jointLoads.length).toBe(2);
  await expect(page.getByTestId("bottom")).toContainText("Đã nhập 24061_OMF.s2k");
  // Khung phẳng có gối, góc xoay cột và tải nút: chạy được bộ giải.
  await page.keyboard.press("F5");
  await expect(page.getByTestId("bottom")).toContainText("Phân tích xong");
});

test("SAP2000 25 có bảng chưa được kiểm chứng: chặn mở", async ({ page }) => {
  await importFixture(page, SAP("Roof_model.2k"), "SAP2000 (.s2k, .$2k)…");
  await expect(page.getByTestId("csi-source")).toContainText("SAP2000 25.3.1");
  await expect(page.getByTestId("csi-error")).toContainText("chưa được kiểm chứng hoặc chưa hỗ trợ");
  await expect(page.getByTestId("csi-open")).toBeDisabled();
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
  await expect(page.getByTestId("csi-open")).toBeDisabled();
});
