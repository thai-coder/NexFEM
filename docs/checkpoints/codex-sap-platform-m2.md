# Checkpoint — M2 SAP2000 Platform 2nd use

- Cập nhật 21/11/2026 (UTC+7) · Codex · REVIEW cho benchmark Mức 1; BLOCKED cho Mức 2 của mô hình gốc.
- Repo `thai-coder/NexFEM`, nhánh `codex/sap-platform-m2`. Nhánh ứng dụng ở `7669db8`; mã benchmark dựa trên HEAD PR #19 tại `845ffc91e3ec320d515a6c7e9dfb1e2d0283bf3c` đã chứa PR #21.
- File nguồn cố định tại `f2df3ae400910a3a07d693d620133ae0b2fd5924`. Đã xác minh SHA-256 S2K và sáu workbook theo Git LFS, xuất CSV, chạy importer và replay tải ở mức tổng lực. Báo cáo và cách chạy lại ở [SAP2000_PLATFORM_M2.md](../validation/SAP2000_PLATFORM_M2.md).
- Hành động tiếp theo: review chênh lệch tải đứng, ưu tiên kiểm tra diện tích hữu hiệu và phân phối uniform-to-frame. Sau khi ánh xạ đủ tải/độ cứng, chốt cùng lần chạy với SAP2000 rồi đối chiếu các chỉ số Mức 2. Nếu cần kiểm chứng sớm, lấy file nhỏ cùng bộ kết quả SAP2000, chỉ dùng frame và gối đã hỗ trợ.
- Điều kiện hoàn thành M2 theo kế hoạch: đối chiếu được các chỉ số trên mô hình tương đương bằng kết quả CSI độc lập và giải thích sai khác ngoài dung sai. Chưa có số liệu sai số solver cho Platform.

## Đối chiếu các ca ngoài động đất — 21/11/2026 (UTC+7)

- REVIEW cho phần kiểm kê và cân bằng nguồn. Bắt đầu từ HEAD PR #24 `cbada2c723c592970d463e1a4f1407cf8b7f314c`, [CI đã đạt](https://github.com/thai-coder/NexFEM/actions/runs/44872130653). Các thay đổi của đợt này nằm trong cùng nhánh và PR.
- Đã đối chiếu bốn ca tĩnh và 12 mode trong bốn bảng kết quả. Ghi riêng cấu hình tự sinh combo và phần chưa có kết quả combo. Cân bằng lực 10/12 đạt, còn DEAD/LIVE FZ. Cân bằng mô men EQ 5/6 đạt, còn EQY MZ. Chạy lại hai lần, JSON giống nhau. Thử bỏ ca LIVE khỏi bảng chuyển vị, bộ kiểm kê báo lỗi. Bốn test bộ so sánh đạt.
- Đã nhập lại các mẫu OMF, Roof và SMFs với SHA-256 khớp fixture. [Báo cáo](../validation/SAP2000_PLATFORM_M2.md#kiểm-kê-ca-tải-và-tổ-hợp) ghi ca có tải thực, ca mới có tên và nhóm tổ hợp chưa có kết quả độc lập.
- Bước tiếp theo: xuất tải đứng đã phân phối của Platform để khoanh vùng sai khác; dùng OMF và Roof để lấy kết quả riêng của tải trọng đứng, gió và tổ hợp. Chỉ chạy Mức 2 trên mô hình con khi đã kiểm chứng đường truyền tải và độ cứng tương đương.
