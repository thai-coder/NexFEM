# Ghi chú kiểm chứng khung ETABS và SAP2000

Cập nhật 16/11/2026 (UTC+7). Nguồn gốc là [bộ tài liệu NexFEM tại commit `4f162a7`](https://github.com/thai-coder/NexFEM/tree/4f162a715d4d60ad63b23a85862160bba09d0568/manual). Đợt đọc này tập trung vào phân tích tĩnh khung, quy ước kết quả và các mục liên quan trực tiếp đến M2. Tiêu chuẩn thiết kế và các chương phân tích nâng cao cần ghi chú riêng theo từng chủ đề.

| Bộ nguồn | Phiên bản trong ReadMe | Bản Analysis Reference Manual trong bộ nguồn | Số trang PDF |
| --- | --- | --- | ---: |
| [ETABS 23](https://github.com/thai-coder/NexFEM/tree/4f162a715d4d60ad63b23a85862160bba09d0568/manual/ETABS%2023/Manuals) | 23.2.0, 23/02/2026 | GEN062708M1 Rev.23, 10/2025 | 478 |
| [SAP2000 26](https://github.com/thai-coder/NexFEM/tree/4f162a715d4d60ad63b23a85862160bba09d0568/manual/SAP2000%2026/Manuals) | 26.2.0, 03/02/2025 | GEN062708M1 Rev.19, 11/2024 | 473 |

Hai manual cùng ghi phạm vi nhiều sản phẩm CSI trên trang PDF 2 và có phiên bản biên tập khác nhau. Bảng dưới chỉ ghi những quy tắc đã đọc được trong cả hai bản. Đơn vị, lựa chọn mặc định, cách tạo mô hình phân tích và dữ liệu đầu ra vẫn cần kiểm chứng cho từng sản phẩm.

## Quy tắc ưu tiên cho M2

Số trang trong hai cột nguồn là số trang của PDF, bắt đầu từ 1. Ký hiệu `§` là mục trong tài liệu.

| Chủ đề | ETABS Rev.23 | SAP2000 Rev.19 | Điều cần kiểm tra trong NexFEM |
| --- | --- | --- | --- |
| Trục địa phương thanh | §7.4, tr. 111–113 | §7.4, tr. 110–113 | Trục 1 theo I→J, góc xoay quanh trục 1 theo quy tắc tay phải. Hai bản dùng ngưỡng sin góc với trục Z nhỏ hơn `10⁻³` để nhận diện thanh đứng. Kiểm tra thanh ngang, đứng, gần đứng và tiết diện xoay. |
| Biến dạng cắt | §7.6.3, tr. 117–118 | §7.6.3, tr. 117–118 | `AS2 = 0` hoặc `AS3 = 0` tắt biến dạng cắt của riêng phương tương ứng. Trên nhánh ứng dụng `7669db8`, cả hai bộ nhập chỉ giữ cặp diện tích khi cả hai đều dương. Bộ giải cũng yêu cầu cả hai dương nếu cặp có mặt. Ca một giá trị bằng 0 cần tái hiện bằng file xuất của từng sản phẩm và kiểm tra chuyển vị theo cả hai phương. |
| Offset đầu thanh và nhả liên kết | §7.10.1–7.10.5, §7.11.2, tr. 130–133 | §7.10.1–7.10.5, §7.11.2, tr. 130–133 | Nhả liên kết đặt tại mặt gối. Vị trí lấy nội lực nằm trên chiều dài thông thủy, bắt đầu và kết thúc ở mặt gối khi có offset. Giữ riêng trục tọa độ dùng để đối chiếu station và vị trí lấy nội lực. |
| Dấu nội lực | §7.22, Hình 7-14, tr. 142–144 | §7.22, Hình 7-14, tr. 142–144 | Kiểm tra trực tiếp hình quy ước trước khi so dấu. `M2` dương gây nén ở mặt `+3`, `M3` dương gây nén ở mặt `+2`. Đối chiếu với trục của đúng thanh và quy ước xuất kết quả của từng sản phẩm. |
| Ca tĩnh tuyến tính | §18.7, tr. 317 | §18.7, tr. 311 | Ca kiểm chứng ban đầu dùng độ cứng trạng thái chưa biến dạng. Tài liệu CSI cũng mô tả tùy chọn dùng độ cứng cuối ca phi tuyến. Xác định rõ điều kiện khởi tạo khi chọn dữ liệu đối chiếu. |
| Diaphragm và shell | §5.4, tr. 64–65 và §10.1, tr. 170–172 | §5.4, tr. 64–65 và §10.1, tr. 170–172 | Ràng buộc diaphragm cứng trong mặt phẳng và phần tử shell có thành phần màng, uốn tấm là hai bài toán cần nghiệm thu riêng. Bộ giải hiện quy tải mặt về thanh hoặc nút, còn shell chịu lực nằm ở Giai đoạn 9. |

Nguồn gốc bảng: [ETABS Analysis Reference Manual](https://github.com/thai-coder/NexFEM/blob/4f162a715d4d60ad63b23a85862160bba09d0568/manual/ETABS%2023/Manuals/CSI%20Analysis%20Reference%20Manual.pdf) và [SAP2000 Analysis Reference Manual](https://github.com/thai-coder/NexFEM/blob/4f162a715d4d60ad63b23a85862160bba09d0568/manual/SAP2000%2026/Manuals/CSI%20Analysis%20Reference%20Manual.pdf).

## Bài kiểm chứng do CSI công bố

| Chế độ | Mẫu nên dựng lại | Kết quả công bố | Điều kiện để dùng cho nghiệm thu M2 |
| --- | --- | --- | --- |
| ETABS 23.2.0 | [Example 01](https://github.com/thai-coder/NexFEM/blob/4f162a715d4d60ad63b23a85862160bba09d0568/manual/ETABS%2023/Manuals/Verification/Analysis/Example%2001.pdf), tr. 1–3. Khung phẳng một tầng, tải tập trung và tải đều, bỏ biến dạng dọc trục và cắt theo giả thiết của mẫu. | Table 1-1 có lực cắt và mô men tại các vị trí dọc dầm B1. | Dựng hoặc lấy mô hình gốc `Example 01.EDB`, chạy trong ETABS 23.2.0 rồi xuất `.e2k` và bảng chuyển vị, phản lực, nội lực. Ghi thông số dùng để bỏ biến dạng và đối chiếu đúng station. |
| SAP2000 26.2.0 | [Problem 1-004](https://github.com/thai-coder/NexFEM/blob/4f162a715d4d60ad63b23a85862160bba09d0568/manual/SAP2000%2026/Manuals/Verification/Analysis/Frames/Problem%201-004.pdf), tr. 1–2. Công xôn W12X106 với trục tiết diện xoay 30°, bỏ biến dạng cắt. | Bảng có `Uy` và `Uz` đầu tự do cho ba ca tải. | Chạy trong SAP2000 26.2.0 rồi xuất `.s2k`, chuyển vị nút, phản lực và nội lực theo station. Bổ sung mẫu công xôn `P`/`PY` của PR #19 cho dấu mô men địa phương. |

Các bảng công bố giúp chọn chỉ số và kiểm tra sơ bộ khi dựng lại. Bản nhà sản xuất trong thư mục `manual/` không ghi phiên bản đã chạy các ví dụ trên. Việc nghiệm thu dùng bảng xuất độc lập có phiên bản, đầu vào và giả thiết đi kèm. Không dùng kết quả do NexFEM sinh làm tham chiếu CSI.

## Đề xuất thứ tự làm tiếp

1. Chốt Giai đoạn 6 cho kết quả khung. Đối chiếu phạm vi còn thiếu với roadmap và chốt rõ mục nào thuộc bản này. Nghiệm thu thao tác hiển thị trên Windows.
2. Ưu tiên phần đối chiếu của Giai đoạn 8 với mốc M2. Xác minh giả thiết mô hình, đơn vị, dấu và cách đọc kết quả riêng từng sản phẩm. Sau khi có bằng chứng, triển khai chuyển chế độ với kiểm tra đầu vào và bắt buộc tính lại.
3. Giai đoạn 7 có thể triển khai API đọc mô hình và kết quả theo nhu cầu. Cầu nối CSI OAPI tiếp tục theo thứ tự đã được duyệt trong `CLAUDE.md` và kế hoạch M0–M4.
4. Giai đoạn 9 triển khai shell tuyến tính và chia lưới trước các đợt modal, phổ phản ứng và P-Delta. Giai đoạn 10 dùng thêm bộ tài liệu thiết kế riêng theo tiêu chuẩn, sản phẩm và phiên bản.

Trạng thái 16/11/2026 (UTC+7): đã đọc các mục nguồn trong bảng và kiểm tra mã bộ nhập, bộ giải liên quan tại `7669db8`. Hai ca nêu trên chưa được chạy lại bằng CSI. Chưa xác nhận tương thích hai chế độ.
