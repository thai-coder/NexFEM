# Phạm vi tiêu chuẩn thiết kế

Cập nhật: 06/11/2026

## Nguyên tắc

- NexFEM **lập trình các công thức và quy trình kiểm tra** của tiêu chuẩn, mỗi kết quả ghi rõ số điều khoản (ví dụ `TCVN 5574:2018 §8.1.2.2`).
- **Không đưa nguyên văn tiêu chuẩn vào repo.** Bản quyền văn bản thuộc cơ quan phát hành (TCVN: Bộ KH&CN/Viện TCCL Việt Nam; Eurocode: CEN và các viện tiêu chuẩn quốc gia; ACI, AISC, ASCE). Người phát triển và người dùng cần có bản tiêu chuẩn chính thức để đối chiếu.
- Mỗi phép kiểm tra phải có ít nhất một ví dụ có đáp án (sách, ví dụ trong tiêu chuẩn hoặc tài liệu hướng dẫn) trong `tests/benchmarks/design/`.
- Phiên bản tiêu chuẩn được ghi trong dữ liệu dự án; khi tiêu chuẩn ra bản mới thì thêm module mới, không sửa đè bản cũ.

## Danh mục theo hệ tiêu chuẩn

Đợt: **1** = làm trước (v0.4), **2** = tiếp theo, **3** = sau cùng.

| Lĩnh vực | TCVN | Eurocode | Mỹ (ACI/AISC/ASCE) |
| --- | --- | --- | --- |
| Tải trọng & tổ hợp | TCVN 2737:2023 — đợt 1 | EN 1990, EN 1991-1-1, -1-3, -1-4 — đợt 2 | ASCE 7-22 (Ch. 2 tổ hợp, Ch. 26–27 gió) — đợt 2 |
| Bê tông cốt thép | TCVN 5574:2018 — đợt 1 | EN 1992-1-1 — đợt 2 | ACI 318-19 (bổ sung ACI 318-25) — đợt 2 |
| Kết cấu thép | TCVN 5575:2024 — đợt 2 | EN 1993-1-1, -1-8 — đợt 2 | AISC 360-22 — đợt 2 |
| Động đất | TCVN 9386:2012 — đợt 2 | EN 1998-1 — đợt 3 | ASCE 7-22 Ch. 11–12, ACI 318 Ch. 18, AISC 341-22 — đợt 3 |
| Móng | TCVN 10304:2014 (móng cọc) — đợt 3 | EN 1997-1 — đợt 3 | ACI 318 Ch. 13 — đợt 3 |

Năm ban hành ở trên cần kiểm tra lại với bản chính thức khi bắt đầu từng module, vì các tiêu chuẩn có thể được soát xét.

## Nội dung kiểm tra (đợt 1, BTCT theo TCVN 5574:2018)

- Dầm: uốn (tính và kiểm tra cốt thép dọc), cắt (cốt đai), kiểm tra độ võng và bề rộng vết nứt.
- Cột: nén lệch tâm xiên, có xét uốn dọc; cấu tạo cốt thép tối thiểu/tối đa.
- Sàn: cốt thép theo nội lực shell (sau khi có shell).
- Vách: kiểm tra theo phương pháp vùng biên (sau khi có shell).

## Kiến trúc mã

```
crates/design-codes/
├── src/
│   ├── lib.rs              # trait DesignCode, DesignCheck, CheckResult { ratio, clause, details }
│   ├── common/             # vật liệu, tiết diện, tương tác N-M, đơn vị
│   ├── tcvn/
│   │   ├── tcvn2737_2023/  # tổ hợp tải
│   │   ├── tcvn5574_2018/  # BTCT
│   │   ├── tcvn5575_2024/  # thép
│   │   └── tcvn9386_2012/  # động đất
│   ├── eurocode/           # en1990, en1992_1_1, en1993_1_1, en1998_1
│   └── us/                 # asce7_22, aci318_19, aisc360_22, aisc341_22
└── tests/                  # ví dụ có đáp án cho từng điều khoản
```

Giao diện chọn tiêu chuẩn ở `Design → Preferences`; mỗi dự án chọn một hệ tiêu chuẩn chính, có thể khác nhau cho BTCT và thép.
