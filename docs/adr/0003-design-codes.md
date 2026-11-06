# ADR 0003: Tiêu chuẩn thiết kế

- Trạng thái: Đã chấp nhận
- Ngày: 06/11/2026

## Bối cảnh

Người dùng muốn hỗ trợ TCVN, Eurocode và ACI/AISC. Làm tất cả cùng lúc không khả thi; văn bản tiêu chuẩn có bản quyền.

## Quyết định

- Hỗ trợ ba hệ: TCVN, Eurocode, Mỹ (ACI/AISC, kèm ASCE 7 cho tải trọng), làm theo đợt trong `docs/design-codes.md`. TCVN (TCVN 2737:2023 + TCVN 5574:2018) làm trước.
- Chỉ lập trình công thức và quy trình, ghi số điều khoản trong kết quả; không đưa nguyên văn tiêu chuẩn vào repo.
- Mỗi tiêu chuẩn là một module có phiên bản riêng trong `crates/design-codes`, cùng tuân theo trait `DesignCode`.
- Mỗi phép kiểm tra có ví dụ có đáp án trong test.

## Hệ quả

- Thêm tiêu chuẩn mới không ảnh hưởng tiêu chuẩn cũ.
- Cần người có chuyên môn kết cấu duyệt từng module trước khi phát hành; kết quả thiết kế phải ghi rõ "người dùng chịu trách nhiệm kiểm tra".
