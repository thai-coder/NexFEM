# Bàn giao công việc giữa ChatGPT, Codex và Claude

Đọc [PROJECT_STATUS.md](../PROJECT_STATUS.md) để tìm PR hoặc nhánh làm việc. Đối chiếu commit và CI hiện tại trước khi tiếp tục. Khi có chênh lệch, dùng bằng chứng mới nhất đã xác minh và giữ các chỉnh sửa đang có.

## Khi nào ghi checkpoint

1. Khi bắt đầu nhiệm vụ nhiều bước, ghi phạm vi, nhánh gốc và việc làm đầu tiên.
2. Sau mỗi mốc có thể tiếp tục, ghi phần đã làm, nơi lưu thay đổi và bước kế tiếp. Ghi lại khi vừa tạo commit, PR, build hoặc CI. Trước bước chạy lâu như build bộ cài, lưu trạng thái đủ để phiên khác theo dõi hoặc chạy lại đúng bước.
3. Khi có dấu hiệu sắp hết ngữ cảnh, thời gian, lượt dùng hoặc quyền công cụ, kích hoạt handoff ngay. Nếu thao tác đang chạy có thể hoàn tất an toàn và nhanh, chốt thao tác đó rồi ghi checkpoint trước khi bắt đầu việc khác. Nếu phải dừng giữa nhiệm vụ, dùng `PAUSED`. Khi vẫn có thể tiếp tục, giữ `IN_PROGRESS` và tiếp tục từ mốc vừa lưu.

Giới hạn cứng có thể kết thúc phiên mà không báo trước. Checkpoint ở bước 1 và 2 là mốc khôi phục trong trường hợp đó.

## Lưu và kiểm tra khả năng khôi phục

- Ưu tiên mục **Checkpoint** trong mô tả PR do phiên làm việc quản lý, hoặc tệp Markdown trên nhánh công việc mà người nhận có quyền đọc. Nếu chưa có PR và có quyền đẩy nhánh, lưu checkpoint cùng thay đổi thuộc nhiệm vụ trên nhánh làm việc. Ghi rõ phần nào còn chưa lưu và người nhận có thể lấy ở đâu.
- Xem lại thay đổi đã stage, chưa stage và file mới trước khi tạo commit. Chỉ đưa vào nhánh phần thuộc nhiệm vụ và có quyền chia sẻ. Giữ nguyên thay đổi của người khác. Nếu không thể lưu từ xa, ghi rõ giới hạn truy cập, vị trí bản cục bộ và phần nào có thể mất khi đổi workspace.
- Đọc lại checkpoint tại nơi đã lưu. Ghi link chính xác để người nhận mở được. Với repo công khai, chỉ đưa thông tin đã được phép chia sẻ. Loại bỏ bí mật, tài liệu riêng và log chứa dữ liệu nhạy cảm.
- Nếu công cụ ghi tệp hoặc GitHub không còn truy cập được, đưa bản checkpoint ngắn vào tin nhắn cuối trong khả năng còn lại. Nêu rõ phần mã nào chưa có đường dẫn khôi phục.

## Mẫu checkpoint

```markdown
## Checkpoint — <mã hoặc tên nhiệm vụ>

- Cập nhật và múi giờ:
- Repo / nhiệm vụ / người đang thực hiện:
- Trạng thái: IN_PROGRESS | PAUSED | BLOCKED | REVIEW | DONE
- Base / nhánh công việc / HEAD đã xác minh:
- PR / issue / CI:
- Đã làm:
- Đang làm và còn lại:
- Vị trí thay đổi chưa có trong HEAD:
- Quyết định và điểm vướng:
- Kiểm thử theo commit (đạt, lỗi, đang chạy, chưa chạy):
- Nghiệm thu thủ công:
- Hành động đầu tiên khi tiếp tục:
- Điều kiện hoàn thành:
```

Dùng `BLOCKED` khi có phụ thuộc bên ngoài cụ thể, `REVIEW` khi đã sẵn sàng review hoặc nghiệm thu, và `DONE` khi đã đạt các điều kiện hoàn thành được giao. Một bản CI xanh chỉ xác nhận các kiểm thử đã chạy.

## Tiếp tục ở mô hình khác

> Đọc checkpoint của nhiệm vụ và kiểm tra nhánh, HEAD, thay đổi chưa lưu và CI. Tiếp tục từ mục **Hành động đầu tiên** nếu vẫn còn đúng. Giữ phạm vi và các quyết định đã ghi.

Nếu checkpoint ghi một CI đang chạy, kiểm tra đúng run trước khi quyết định chạy lại. Nếu có mã chưa có trong HEAD, tìm và kiểm tra bản đã lưu trước khi sửa hoặc tạo lại phần việc đó.
