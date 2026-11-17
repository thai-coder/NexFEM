# Checkpoint — cảnh báo tải SAP2000

- 17/11/2026 (UTC+7), trạng thái IN_PROGRESS.
- Nhánh `codex/sap-critical-load-warnings`, base `d255da082b4adf898cc2ad7a1a6ee2ea07e16fca`, mã ứng dụng được kiểm tra `7669db8bb1f6d02e76feb6936627c9ce3518469c`.
- Mục tiêu: báo lỗi rõ ràng khi bảng tải SAP2000 không được nhập; kiểm tra tác động tới giao diện và bổ sung kiểm thử. Bảo toàn các thay đổi có sẵn trong worktree khác.
- Bước tiếp: kiểm tra phân loại bảng và các kiểm thử UI, sau đó sửa và chạy test. Chưa có CI, PR hay nghiệm thu Windows.
