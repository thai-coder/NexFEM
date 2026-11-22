---
id: csi-import-local-axes-joint-loads
title: Nhập file CSI, góc xoay trục, tải nút
status: REVIEW
owner: Claude
branch: claude/etab-sap2000-connection-vts58p
updated: 2026-11-14
next: Nghiệm thu trên Windows: nhập .e2k/.s2k, góc xoay trục, tải nút
assign: Chủ dự án
---
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
