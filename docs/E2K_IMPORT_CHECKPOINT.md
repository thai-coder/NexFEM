# Checkpoint — Nhập ETABS `.e2k` (M1, phần ETABS)

- **Cập nhật và múi giờ:** 14/11/2026 (UTC).
- **Repo / nhiệm vụ / người thực hiện:** `thai-coder/NexFEM` / CSI Text Import MVP, phần `.e2k` / Claude.
- **Trạng thái:** `REVIEW` cho mã; M1 tổng thể chưa xong (thiếu `.s2k`), M2 bị chặn (thiếu bảng kết quả ETABS).
- **Base / nhánh công việc:** xếp chồng trên `claude/box-and-reports` (PR #14). Nhánh `claude/e2k-import`.
- **Đã làm:** package `@nexfem/io-formats` (tách cú pháp, ánh xạ, báo cáo); File ▸ Nhập ETABS (.e2k)… và hộp thoại báo cáo; file mẫu ETABS 23.2.0 chép từ `main` không đổi byte (`.gitattributes` chặn chuẩn hoá xuống dòng); tài liệu `docs/csi-import.md`.
- **Kiểm thử cục bộ:** typecheck; 21 test io-formats, 79 model-core, 20 viewer, 8 desktop; 89 bài Playwright (3 mới).
- **Hành động đầu tiên khi tiếp tục:** xem `docs/csi-import.md` mục "Việc tiếp theo"; ưu tiên tải tập trung tại nút (cần schema + bộ giải, phối hợp Codex).
- **Điều kiện hoàn thành M1:** thêm `.s2k` thật; người dùng thử nhập file ETABS khác và xác nhận các giả định ánh xạ (đặc biệt DZ, PINNED).
