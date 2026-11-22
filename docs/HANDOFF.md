# Bàn giao công việc giữa ChatGPT, Codex và Claude

Đọc chỉ mục [PROJECT_STATUS.md](../PROJECT_STATUS.md) để tìm nhiệm vụ, rồi mở đúng một file checkpoint của nhiệm vụ đó trong [docs/checkpoints/](checkpoints/README.md). Đối chiếu commit và CI hiện tại trước khi tiếp tục.

**Mỗi nhiệm vụ một file checkpoint, chỉ người làm nhiệm vụ đó sửa.** `PROJECT_STATUS.md` được sinh bằng `python3 scripts/checkpoint_index.py`; không sửa tay. Quy tắc đặt tên và phần đầu file: [docs/checkpoints/README.md](checkpoints/README.md). Khi có chênh lệch, dùng bằng chứng mới nhất đã xác minh và giữ các chỉnh sửa đang có.

## Xác định phiên hoạt động cuối

Tên tác giả git không phân biệt được các mô hình AI: commit của Codex hiện mang tên chủ dự án. Vì vậy mỗi phiên phải tự ghi dấu.

1. **Mọi commit do AI tạo có trailer** ở cuối thông điệp commit:

   ```text
   Agent: <Codex | Claude | ChatGPT> (<tên mô hình>)
   Agent-Session: <link hoặc ID của phiên>
   ```

   Claude Code đã tự thêm `Claude-Session:`; trailer này cũng được nhận.
2. **Checkpoint ghi giờ và phiên:** `updated` có giờ và múi giờ (ví dụ `2026-11-22T09:30+07:00`), `session` là link hoặc ID phiên.
3. **Trước khi bắt đầu**, chạy `python3 scripts/checkpoint_index.py --latest`. Lệnh này fetch mọi nhánh và liệt kê nhánh có commit mới nhất, kèm trailer phiên của commit đầu nhánh. Dòng ghi "không có trailer phiên" là commit của người hoặc của phiên chưa theo quy tắc này. Chỉ mục `PROJECT_STATUS.md` chỉ thấy checkpoint đã vào `main`, nên luôn đối chiếu với lệnh này.
4. **Nhận nhiệm vụ trước khi làm:** đẩy checkpoint `IN_PROGRESS` có `session` ngay đầu phiên (bước 1 bên dưới). Nếu nhiệm vụ đã có checkpoint `IN_PROGRESS` của phiên khác, hoặc nhánh của nhiệm vụ vừa có commit mới, không làm chồng: hỏi chủ dự án hoặc nhận tiếp bằng cách ghi rõ phiên cũ đã dừng.

## Kết thúc mỗi lượt

Mỗi lượt kết thúc bằng một dòng báo cáo theo [docs/TEAM_CONVENTIONS.md](TEAM_CONVENTIONS.md#1-end-of-turn-report-line): `[UTC yyyy-mm-dd hh:mm] Đã làm | Việc kế tiếp | Ai làm`. Nếu lượt đó thay đổi nhiệm vụ, ghi cùng nội dung vào `next` và `assign` trong checkpoint, rồi sinh lại chỉ mục.

## Khi nào ghi checkpoint

1. Khi bắt đầu nhiệm vụ nhiều bước, ghi phạm vi, nhánh gốc và việc làm đầu tiên.
2. Sau mỗi mốc có thể tiếp tục, ghi phần đã làm, nơi lưu thay đổi và bước kế tiếp. Ghi lại khi vừa tạo commit, PR, build hoặc CI. Trước bước chạy lâu như build bộ cài, lưu trạng thái đủ để phiên khác theo dõi hoặc chạy lại đúng bước.
3. Khi có dấu hiệu sắp hết ngữ cảnh, thời gian, lượt dùng hoặc quyền công cụ, kích hoạt handoff ngay. Nếu thao tác đang chạy có thể hoàn tất an toàn và nhanh, chốt thao tác đó rồi ghi checkpoint trước khi bắt đầu việc khác. Nếu phải dừng giữa nhiệm vụ, dùng `PAUSED`. Khi vẫn có thể tiếp tục, giữ `IN_PROGRESS` và tiếp tục từ mốc vừa lưu.

Giới hạn cứng có thể kết thúc phiên mà không báo trước. Checkpoint ở bước 1 và 2 là mốc khôi phục trong trường hợp đó.

## Lưu và kiểm tra khả năng khôi phục

- Ghi vào file `docs/checkpoints/<id>.md` của nhiệm vụ (id = tên nhánh, đổi `/` thành `-`), rồi chạy `python3 scripts/checkpoint_index.py`. Có thể chép tóm tắt vào mục **Checkpoint** trong mô tả PR. Không ghi nối vào checkpoint của nhiệm vụ khác; người review ghi nhận xét trong PR hoặc trong file riêng có `parent:`. Nếu chưa có PR và có quyền đẩy nhánh, lưu checkpoint cùng thay đổi thuộc nhiệm vụ trên nhánh làm việc. Ghi rõ phần nào còn chưa lưu và người nhận có thể lấy ở đâu.
- Xem lại thay đổi đã stage, chưa stage và file mới trước khi tạo commit. Chỉ đưa vào nhánh phần thuộc nhiệm vụ và có quyền chia sẻ. Giữ nguyên thay đổi của người khác. Nếu không thể lưu từ xa, ghi rõ giới hạn truy cập, vị trí bản cục bộ và phần nào có thể mất khi đổi workspace.
- Đọc lại checkpoint tại nơi đã lưu. Ghi link chính xác để người nhận mở được. Với repo công khai, chỉ đưa thông tin đã được phép chia sẻ. Loại bỏ bí mật, tài liệu riêng và log chứa dữ liệu nhạy cảm.
- Nếu công cụ ghi tệp hoặc GitHub không còn truy cập được, đưa bản checkpoint ngắn vào tin nhắn cuối trong khả năng còn lại. Nêu rõ phần mã nào chưa có đường dẫn khôi phục.

## Mẫu checkpoint

Bản đầy đủ, kèm phần đầu file cho chỉ mục: [docs/checkpoints/_TEMPLATE.md](checkpoints/_TEMPLATE.md).

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
