# NexFEM — Hướng dẫn làm việc

**Read [docs/TEAM_CONVENTIONS.md](docs/TEAM_CONVENTIONS.md) first: the end-of-turn report line, source of truth, merge rules, POLICY-001 (no app builds or releases), language and model guidance shared by every model.**

- Khi bắt đầu hoặc tiếp tục nhiệm vụ, đọc chỉ mục [PROJECT_STATUS.md](PROJECT_STATUS.md), file checkpoint của nhiệm vụ trong [docs/checkpoints/](docs/checkpoints/README.md), [quy trình bàn giao](docs/HANDOFF.md) và [CLAUDE.md](CLAUDE.md) trên nhánh mặc định. Với nhiệm vụ có PR, đối chiếu checkpoint với nhánh, commit và CI hiện tại trước khi sửa.
- Mỗi nhiệm vụ một file checkpoint riêng; chỉ sửa file của nhiệm vụ mình. Không sửa tay `PROJECT_STATUS.md`: chạy `python3 scripts/checkpoint_index.py`. Nếu chỉ mục xung đột, chạy lại script thay vì gộp tay.
- Mỗi commit do AI tạo kết thúc bằng trailer `Agent: <tên> (<mô hình>)` và `Agent-Session: <link hoặc ID phiên>`. Trước khi bắt đầu, chạy `python3 scripts/checkpoint_index.py --latest` để biết phiên nào hoạt động cuối (xem [HANDOFF](docs/HANDOFF.md#xác-định-phiên-hoạt-động-cuối)).
- Mỗi lượt kết thúc bằng dòng báo cáo trong [TEAM_CONVENTIONS](docs/TEAM_CONVENTIONS.md#1-end-of-turn-report-line). Nhiệm vụ chưa `DONE` phải có `next` và `assign` trong checkpoint.
- Với nhiệm vụ nhiều bước, lưu checkpoint ở đầu phiên, sau mỗi mốc đã xác minh và trước khi chạy tác vụ dài. Nếu sắp hết ngữ cảnh, thời gian, quyền công cụ hoặc lượt dùng, chuyển sang bàn giao ngay theo quy trình.
- Từ nhánh tính năng chưa có các tệp này, đọc bản trên nhánh mặc định của NexFEM và checkpoint mới nhất trong PR hoặc nhánh làm việc.
