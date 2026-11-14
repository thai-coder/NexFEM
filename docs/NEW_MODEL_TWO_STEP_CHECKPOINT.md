# Checkpoint — Mục 11/12: New Model hai bước và mẫu sàn phẳng

- **Cập nhật và múi giờ:** 13/11/2026 (UTC).
- **Repo / nhiệm vụ / người thực hiện:** `thai-coder/NexFEM` / `docs/ux-round3.md` mục 11 và 12 / Claude.
- **Trạng thái:** `REVIEW` (mã và kiểm thử tự động xong; chưa có CI và chưa nghiệm thu trên Windows).
- **Base / nhánh công việc:** tách từ `codex/phase6-3-m2` tại `445257f` (PR #8); nhánh `claude/new-model-two-step`. Nhánh `claude/etab-sap2000-connection-vts58p` là gốc của chuỗi PR #1–#8 nên không đẩy thêm vào đó.
- **Đã làm:** hộp thoại New Model hai bước (khởi tạo / mẫu nhanh); thiết lập từ bộ có sẵn, bộ đã lưu (localStorage `nexfem:newModelDefaults`) hoặc từ file `.nxf`; lưới đều và tầng đơn giản; mẫu sàn phẳng và sàn phẳng có dầm biên (`createRcFrameModel` với `objects: "flatSlab" | "flatSlabBeams"`).
- **Giới hạn đã ghi trong giao diện:** sàn phẳng chưa có độ cứng shell, tải sàn chuyển thẳng về cột (Giai đoạn 9 mới có shell). Chưa có vật liệu theo vùng và CSDL thép hình.
- **File chạm vào:** `NewModelDialog.tsx`, `files.ts` (thêm `pickProjectModel`), `i18n/vi.ts`, `i18n/en.ts`, `styles.css`, `model-core/src/templates.ts`, các spec e2e có luồng tạo mô hình (thêm bước bấm "Tiếp"). Không động tới solver, viewer, results (phần Giai đoạn 6).
- **Kiểm thử cục bộ:** typecheck đạt; 53 test model-core (5 mới), 17 viewer, 7 desktop; 70 bài Playwright (9 mới trong `newmodel.spec.ts`, gồm F5 chạy được cho hai mẫu sàn phẳng).
- **Kiểm thử trên CI / Windows:** chưa chạy.
- **Hành động đầu tiên khi tiếp tục:** nếu nhánh đã đẩy, mở PR và đối chiếu CI; kiểm tra xung đột với PR Giai đoạn 6 ở `apps/desktop/src/i18n/*`, `styles.css`, `tests/e2e/specs/*`.
- **Điều kiện hoàn thành:** CI xanh, thử tạo mô hình bằng cả hai bước trên Windows, chủ dự án xác nhận.
