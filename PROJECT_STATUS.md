# NexFEM — Trạng thái và checkpoint

Ảnh chụp trạng thái ngày 14/11/2026 (UTC). Xem [quy trình bàn giao](docs/HANDOFF.md) và đối chiếu PR, nhánh, CI trước khi tiếp tục.

## Checkpoint — PR #16 sửa chia tấm và PR #17 đóng mô hình (15/11/2026, UTC+7)

- **Trạng thái:** `REVIEW`. Codex nhận lại phần sửa sau review của Claude. Hai PR cùng nhắm nhánh ứng dụng `claude/etab-sap2000-connection-vts58p`; mỗi PR có thể kiểm tra riêng.
- **PR #16:** nhánh `claude/footing-interior-nodes` tại `6730eb3c2a93e713359c5dc10226def756d2758b`, base `3b9e483`. Sửa ba ca trong checkpoint bên dưới, giữ tổng diện tích trước khi quy lò xo, cảnh báo nếu phải quy về góc. Typecheck, toàn bộ unit test và 60 test io-formats đạt trên cây mã của HEAD. Kiểm tra lại fixture bằng WASM: 11 case tĩnh chạy, CDL lún lớn nhất 92,55 mm theo NexFEM, không ca chia tấm phải quy về góc do lỗi. [PR #16](https://github.com/thai-coder/NexFEM/pull/16) · [CI](https://github.com/thai-coder/NexFEM/actions/runs/43724493896)
- **PR #17:** nhánh `codex/close-model` tại `c014755b314a5b9b5e7edbab17789e97320a97ca`, base `3b9e483`. File → Đóng mô hình / Ctrl+W, bảo vệ thay đổi chưa lưu, quay về Trang chủ trong cùng cửa sổ. Typecheck, unit test, build web/WASM và toàn bộ 101 bài Playwright đạt cục bộ. [PR #17](https://github.com/thai-coder/NexFEM/pull/17) · [CI](https://github.com/thai-coder/NexFEM/actions/runs/43724948392)
- **Thay đổi ngoài HEAD:** Không có phần mã cần khôi phục.
- **Tiếp theo:** Xem kết luận CI và bản cài tại từng PR. Đối với PR #16, review chéo phần hình học/đường truyền tải trên HEAD đã sửa trước merge (Codex GPT‑6.1 Terra · High hoặc Claude Opus · High). Đối với PR #17, thử trên Windows thao tác đóng bằng menu và Ctrl+W, gồm lưu vào file .nxf, huỷ và mở lại từ Trang chủ. CI cài/gỡ thử và E2E web không thay cho nghiệm thu thao tác WebView2. Đối chiếu trị số với ETABS vẫn cần bảng xuất độc lập.

## Checkpoint — Review PR #16: chia tấm tại nút để quy lò xo nền (15/11/2026, UTC+7)

- **Trạng thái:** `REVIEW`, Codex đã kiểm tra và yêu cầu sửa trước khi merge. [PR #16](https://github.com/thai-coder/NexFEM/pull/16)
- **Base / HEAD:** `claude/etab-sap2000-connection-vts58p` tại `3b9e48348dc3f9b5ba65faacbcc291aa5192d821` / `claude/footing-interior-nodes` tại `a7640a72d2be8802c995f285d52735ea2a5e415a`. Commit dùng cho CI có cùng cây mã với HEAD; Rust, TypeScript, Playwright và kiểm thử bộ cài Windows đều đạt. [CI](https://github.com/thai-coder/NexFEM/actions/runs/43699113404)
- **Hai lỗi tái hiện trên HEAD:** (1) Tấm chữ L với góc `[(0,0),(2,0),(2,1),(1,1),(1,2),(0,2)]`, nút `(0.5,0.5)` và dung sai `1e-6 m` cho tổng diện tích phân bổ `4 m²` thay vì `3 m²`. Bước cắt tai cho phép đường chéo đi qua đỉnh lõm. (2) Tấm `4 × 2 m`, nút `(2,-0.0009)` và dung sai `0.001 m` cho nút ngoài tấm nhận `2.6678667 m²` và làm tổng tăng từ `8` lên `8.0036 m²`. Đo trên `meshedNodeAreas` của commit trên bằng Node.
- **Ca cần bổ sung:** Đảo thứ tự hai ứng viên `(2,0)` và `(1,0.5)` trên tấm `4 × 2 m` làm phần diện tích nút mép đổi từ `2.3333` sang `0.3333 m²` dù tổng vẫn là `8 m²`. Cần phân bổ nhất quán khi thứ tự bản ghi đổi.
- **Hành động đầu tiên:** Claude Code (Opus, High) thêm các ca tái hiện vào `packages/io-formats/test/locate.test.ts`, sửa nhận diện nút sát mép và tam giác hoá trong PR #16, rồi giữ test mô hình thật C3/nút 57 và chạy CI. Codex kiểm tra lại trên SHA mới trước khi chủ dự án merge.
- **Còn lại:** Nghiệm thu Windows và đối chiếu trị số với ETABS. Review chỉ thay đổi checkpoint; mã PR ở nguyên commit được kiểm tra.

## Checkpoint — Nhập file CSI, góc xoay trục, tải nút (14/11/2026)

- **Trạng thái:** `REVIEW`. Mã nằm trên nhánh ứng dụng `claude/etab-sap2000-connection-vts58p`; bản phát hành mới nhất [v0.1.153](https://github.com/thai-coder/NexFEM/releases/tag/v0.1.153) (CI qua Rust, TypeScript, Playwright 97 bài, cài/gỡ MSI và NSIS).
- **Đã làm:**
  - Bộ nhập ETABS `.e2k` và SAP2000 `.s2k`/`.$2k` (package `@nexfem/io-formats`), kiểm tra trên file thật; menu File ▸ Nhập file có mục riêng cho từng định dạng; báo cáo nhập cho mọi phần bị bỏ hoặc gần đúng; `.sdb` nhị phân được nhận ra và hướng dẫn xuất `.s2k`.
  - Ba file SAP2000 thật (chủ dự án cho phép công khai) nằm trong `tests/fixtures/csi/sap2000/`, giữ nguyên byte, có README.
  - Schema thêm `Frame.angle` (góc xoay trục địa phương, quy ước CSI) và `Model.jointLoads` (tải nút); cả hai tương thích ngược. Bộ giải, biểu đồ mô men, khung nhìn, Properties, Assign ▸ Tải tại nút đã dùng chúng.
  - Ứng dụng khởi động bằng mô hình trống (mô hình mẫu mở theo yêu cầu); file `.nxf` có biểu tượng và mở bằng bấm đúp (MSI và NSIS).
  - Quy tắc phiên bản `X.Y.Z` (X = năm − 2026, Y = số tháng đếm liên tục từ 10/2026, Z = số lần chạy CI): xem `docs/versioning.md` trên nhánh ứng dụng.
- **Đọc tiếp:** `docs/csi-import.md` (phạm vi, giả định ánh xạ, việc tiếp theo) và `docs/E2K_IMPORT_CHECKPOINT.md` trên nhánh ứng dụng.
- **Còn lại:** tiết diện chữ L và General; lò xo nút/nền; mô men tập trung trên thanh; tự tính `X.Y` của phiên bản trong `scripts/set-version.mjs`; đối chiếu kết quả phân tích (M2) khi có bảng chuyển vị, phản lực, nội lực xuất từ ETABS/SAP2000; nghiệm thu thao tác thực tế trên Windows.
- **Dọn nhánh:** 14 nhánh tính năng đã nằm trong nhánh ứng dụng (hoặc đã có nội dung trên `main`) được chủ dự án xoá thủ công; còn `main`, nhánh ứng dụng và `installer` (CI tự cập nhật).

## Checkpoint — Tích hợp 5A–6.3 để Claude tiếp tục

- **Trạng thái tích hợp:** `DONE` ngày 13/11/2026 (UTC+7). Codex đã merge [PR #9](https://github.com/thai-coder/NexFEM/pull/9) vào nhánh ứng dụng `claude/etab-sap2000-connection-vts58p` tại [`46d01d7`](https://github.com/thai-coder/NexFEM/commit/46d01d78beda02574959f9503cacaac3eb5e3a6f).
- **Phạm vi:** Solver 5A/5B, chọn case kết quả 6.1, biến dạng 6.2, chạy biến dạng tĩnh và biểu đồ M3/M2 6.3. Nhánh ứng dụng có đúng cây mã của commit M2 `445257f`, đã qua [CI Rust, TypeScript, Playwright và kiểm thử bộ cài Windows](https://github.com/thai-coder/NexFEM/actions/runs/43348581179).
- **Claude tiếp tục:** Nhánh [`claude/new-model-two-step`](https://github.com/thai-coder/NexFEM/tree/claude/new-model-two-step) tại `b2d5b0f` đã chứa commit M2 `445257f`. Sau tích hợp, diff với nhánh ứng dụng chỉ còn commit New Model của Claude. Đọc [checkpoint New Model](https://github.com/thai-coder/NexFEM/blob/claude/new-model-two-step/docs/NEW_MODEL_TWO_STEP_CHECKPOINT.md), rồi mở PR riêng với base `claude/etab-sap2000-connection-vts58p` để chạy CI và nghiệm thu Windows.
- **Nghiệm thu còn lại của 6.3:** Thao tác M3/M2 trực tiếp trên Windows và đối chiếu M2 bằng bảng nội lực xuất từ SAP2000. [Checklist M2 và bộ cài](https://github.com/thai-coder/NexFEM/pull/8#checkpoint--63-m2)
- **Thay đổi ngoài commit tích hợp:** Không có trong phạm vi công việc của Codex.

## Checkpoint trước tích hợp — 6.3 Biểu đồ M3 và chạy biến dạng tĩnh

- **Trạng thái:** `REVIEW`. Codex đã hoàn thành phần triển khai và kiểm thử tự động.
- **Base:** `codex/phase6-2-plan-elevation` tại `5034badee1290ed66bf00e5c76e3ba0f0f366f2b`. **Nhánh công việc:** `codex/phase6-3-m3`. **HEAD:** `0d60b853112947a8a7bf4b751be31bd895f469c3`.
- **Đã làm:** Hiển thị M3 theo case và station, scale tự động hoặc nhập tay, bảng M3 của thanh được chọn và chạy/dừng hình biến dạng tĩnh.
- **Thay đổi ngoài HEAD:** Không có tại thời điểm ghi checkpoint. Mã 6.3 đã có trên nhánh công việc.
- **Kiểm thử:** TypeScript, 70 unit test, 60 bài Playwright và build WASM đã qua cục bộ. CI đã qua Rust, TypeScript, Playwright và kiểm thử cài/gỡ MSI, NSIS. [PR #6 (Draft)](https://github.com/thai-coder/NexFEM/pull/6) · [CI](https://github.com/thai-coder/NexFEM/actions/runs/43328487471) · [Bộ cài Windows](https://github.com/thai-coder/NexFEM/actions/runs/43328487471/artifacts/13994442336)
- **Còn lại:** Nghiệm thu thao tác thực tế trên Windows và review PR. M2 là nhiệm vụ kế tiếp khi được giao.
- **Hành động đầu tiên:** Mở PR #6 để xác nhận HEAD và kết quả CI. Nếu tiếp tục nghiệm thu M3, dùng bộ cài của run tương ứng và thử F5, đổi case, đổi scale, chạy/dừng biến dạng và F6.
- **Điều kiện hoàn thành review:** Ghi kết quả thử trên Windows và xử lý các lỗi phát hiện trong phạm vi M3.
