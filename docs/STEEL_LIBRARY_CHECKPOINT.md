# Checkpoint — Thư viện thép hình (mục 13, ba nguồn TCVN 7571 / EN 10365 / AISC)

- **Cập nhật và múi giờ:** 13/11/2026 (UTC).
- **Repo / nhiệm vụ / người thực hiện:** `thai-coder/NexFEM` / thư viện thép hình / Claude.
- **Trạng thái:** `BLOCKED` về dữ liệu, `REVIEW` về mã. Mã nhập và kiểm tra đã xong; bảng thép của ba nguồn chưa có vì vướng quyền sử dụng (xem `docs/steel-library.md`).
- **Base / nhánh công việc:** xếp chồng trên `claude/section-accuracy` (PR #12, cần trường `r`). Nhánh `claude/steel-library`.
- **Đã làm:** `parseSteelLibraryCsv` (định dạng NexFEM, bảng AISC lưu thành CSV), `checkSteelLibrary` (so với giá trị bảng); store `useSteelLibrary` (localStorage); nút nạp, gỡ, báo dòng lỗi và tiết diện lệch, "Thêm từ thư viện…" theo nhóm trong Define ▸ Tiết diện thanh.
- **Đang chờ chủ dự án:** bảng TCVN 7571-15/16 từ bản tiêu chuẩn đã mua; file AISC Shapes Database tải bằng trình duyệt (aisc.org chặn truy cập tự động); quyết định với EN 10365 (bản tiêu chuẩn đã mua hoặc văn bản đồng ý của nhà sản xuất).
- **Kiểm thử cục bộ:** typecheck; 66 model-core, 20 viewer, 7 desktop; 81 bài Playwright (2 mới).
- **Hành động đầu tiên khi tiếp tục:** khi có file của một nguồn, nạp vào app hoặc chạy `checkSteelLibrary` trên file đó, xem danh sách lệch, sửa công thức nếu lệch do hình dạng (ví dụ bán kính góc của ống hộp).
- **Điều kiện hoàn thành:** mỗi nguồn nạp được toàn bộ tiết diện chữ I, hộp, ống mà nguồn có; danh sách lệch được giải thích; quyết định về việc có phân phối bảng trong NexFEM hay không.
