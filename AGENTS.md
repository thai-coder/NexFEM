# NexFEM — Hướng dẫn làm việc

- Khi bắt đầu hoặc tiếp tục nhiệm vụ, đọc chỉ mục [PROJECT_STATUS.md](PROJECT_STATUS.md), file checkpoint của nhiệm vụ trong [docs/checkpoints/](docs/checkpoints/README.md), [quy trình bàn giao](docs/HANDOFF.md) và [CLAUDE.md](CLAUDE.md) trên nhánh mặc định.
- Mỗi nhiệm vụ một file checkpoint riêng; chỉ sửa file của nhiệm vụ mình. Không sửa tay `PROJECT_STATUS.md`: chạy `python3 scripts/checkpoint_index.py`. Nếu chỉ mục xung đột, chạy lại script thay vì gộp tay. Với nhiệm vụ có PR, đối chiếu checkpoint với nhánh, commit và CI hiện tại trước khi sửa.
- Với nhiệm vụ nhiều bước, lưu checkpoint ở đầu phiên, sau mỗi mốc đã xác minh và trước khi chạy tác vụ dài. Nếu sắp hết ngữ cảnh, thời gian, quyền công cụ hoặc lượt dùng, chuyển sang bàn giao ngay theo quy trình.
- Từ nhánh tính năng chưa có các tệp này, đọc bản trên nhánh mặc định của NexFEM và checkpoint mới nhất trong PR hoặc nhánh làm việc.
