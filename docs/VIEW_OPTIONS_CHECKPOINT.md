# Checkpoint — Mục 15: Set View Options theo từng cửa sổ

- **Cập nhật và múi giờ:** 13/11/2026 (UTC).
- **Repo / nhiệm vụ / người thực hiện:** `thai-coder/NexFEM` / `docs/ux-round3.md` mục 15 / Claude.
- **Trạng thái:** `REVIEW` (mã và kiểm thử tự động xong; chưa có CI và chưa nghiệm thu trên Windows).
- **Base / nhánh công việc:** xếp chồng trên `claude/new-model-two-step` (`b2d5b0f`), nhánh đó nằm trên nhánh ứng dụng sau PR #9 (`46d01d7`). Nhánh: `claude/view-options`. Merge theo thứ tự: New Model trước, View Options sau.
- **Đã làm:**
  - `packages/viewer/src/display.ts`: `DisplayOptions` mở rộng (nút, dầm, cột, giằng, sàn, vách; nhãn nút, nhãn thanh, tên tiết diện, nhãn sàn/vách; gối, nhả liên kết, tải; lưới, tô màu sàn), `DEFAULT_DISPLAY`, `normalizeDisplay` (đọc dữ liệu 4 khoá cũ), `applyDisplayFilter`.
  - Viewer: đối tượng bị ẩn không vẽ, không chọn, không bắt điểm; ẩn lưới thì không bắt điểm vào lưới và không bấm trục được; tắt tô màu vẫn bấm chọn sàn được.
  - Store: `viewDisplay[]` cho 4 ô (localStorage `nexfem:viewDisplay`, đọc được `nexfem:display` cũ), `setViewDisplay(pane | "all")`.
  - Hộp thoại `ViewOptionsDialog`: OK / Áp dụng / Huỷ / Mặc định, ô "Áp dụng cho tất cả cửa sổ". Mở bằng nút ⚙ trên đầu mỗi ô, View ▸ Tuỳ chọn hiển thị…, menu chuột phải.
  - Lệnh nhanh View ▸ Hiện nút / nhãn nút / nhãn thanh / gối áp dụng cho cửa sổ đang hoạt động (trước đây áp dụng cho mọi ô).
- **Phần Giai đoạn 6 không đổi:** biểu đồ M2/M3 và biến dạng dùng tập đối tượng đã lọc, nên thanh bị ẩn cũng không có biểu đồ trong cửa sổ đó.
- **Kiểm thử cục bộ:** typecheck đạt; 53 model-core, 20 viewer (3 mới), 7 desktop; 78 bài Playwright (8 mới trong `viewoptions.spec.ts`).
- **Hành động đầu tiên khi tiếp tục:** nếu đã đẩy, mở PR theo thứ tự (New Model rồi View Options) và đối chiếu CI.
- **Điều kiện hoàn thành:** CI xanh, thử trên Windows với bố cục 2 và 4 ô, chủ dự án xác nhận.
