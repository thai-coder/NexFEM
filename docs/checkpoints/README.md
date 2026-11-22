# Checkpoint theo nhiệm vụ

Mỗi nhiệm vụ có **một file riêng** `docs/checkpoints/<id>.md`. Chỉ người đang làm nhiệm vụ đó sửa file này. Vì vậy hai nhánh không bao giờ cùng sửa một checkpoint.

[`PROJECT_STATUS.md`](../../PROJECT_STATUS.md) là chỉ mục **sinh tự động** từ phần đầu của các file này, mỗi nhiệm vụ một dòng. Không sửa tay chỉ mục.

## Quy tắc

1. **Đặt id:** lấy tên nhánh công việc, đổi `/` thành `-`. Ví dụ, nhánh `claude/frame-load-linear` dùng id `claude-frame-load-linear`. Tên nhánh là duy nhất, nên id cũng duy nhất. Nhiệm vụ không có nhánh riêng thì dùng tên mô tả ngắn (chữ thường, số, `-`).
2. **Một người viết:** chỉ cập nhật file của nhiệm vụ mình. Người review ghi nhận xét trong PR, hoặc tạo file riêng (`<id>-review-<người review>`) với `parent: <id>`. Không ghi nối vào checkpoint của nhiệm vụ khác.
3. **Ghi đè, không chồng thêm:** cập nhật phần đầu và nội dung hiện tại. Lịch sử đã có trong git (`git log -p docs/checkpoints/<id>.md`), nên không cần giữ lại các bản cũ trong file.
4. **Sinh lại chỉ mục:** sau khi sửa phần đầu, chạy `python3 scripts/checkpoint_index.py` và commit cả hai file. Nếu `PROJECT_STATUS.md` xung đột khi merge hoặc rebase, chạy lại script và stage kết quả, không gộp tay.
5. **Nơi lưu:** trên `main`, chỉ mục và checkpoint là phần điều phối chung. Khi đang làm mã trên nhánh khác, có thể ghi checkpoint tại cùng đường dẫn trên nhánh công việc, rồi đưa lên `main` sau. Vì đường dẫn riêng theo nhiệm vụ, hai bản sẽ không đụng nhau.

## Phần đầu file

```yaml
---
id: claude-frame-load-linear        # bắt buộc, trùng tên file
title: Tải thanh hình thang/một đoạn  # bắt buộc, một dòng
status: IN_PROGRESS                 # bắt buộc: IN_PROGRESS | PAUSED | BLOCKED | REVIEW | DONE
owner: Claude                       # bắt buộc: người/mô hình đang giữ nhiệm vụ
updated: 2026-11-22T09:30+07:00     # bắt buộc, có giờ và múi giờ (checkpoint cũ được giữ YYYY-MM-DD)
branch: claude/frame-load-linear    # tuỳ chọn
pr: 19                              # tuỳ chọn, chỉ ghi số
parent: claude-frame-load-linear    # tuỳ chọn, cho file review hoặc nhiệm vụ con
session: https://claude.ai/code/session_…  # nên có: link hoặc ID phiên AI đang giữ nhiệm vụ
---
```

Phần thân theo [mẫu checkpoint](_TEMPLATE.md). Xem cách xác định phiên hoạt động cuối trong [HANDOFF](../HANDOFF.md#xác-định-phiên-hoạt-động-cuối). Kiểm tra cục bộ: `python3 scripts/checkpoint_index.py --check`. CI trên `main` chạy cùng lệnh này.
