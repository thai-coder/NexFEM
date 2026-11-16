# Tra cứu tài liệu và kiểm chứng chế độ phân tích CSI

Cập nhật 16/11/2026 (UTC+7). Tài liệu này ghi yêu cầu của dự án, nguồn theo từng sản phẩm và điều kiện nghiệm thu. Hai bộ PDF hiện nằm trong `manual/` trên nhánh `main`. Xem [ghi chú phân tích khung và kiểm chứng](CSI_FRAME_REFERENCE_NOTES.md) để tra phiên bản, trang gốc và các khoảng trống của bộ giải. Hai chế độ tương thích CSI vẫn ở mức đặc tả.

## Mục lục tra cứu

| Phạm vi | Nguồn hiện có | Tài liệu cần lập chỉ mục từ bộ gốc |
| --- | --- | --- |
| ETABS | [ETABS Help → Documentation](https://docs.csiamerica.com/help-files/etabs/Menus/Help/Documentation.htm) | Phiên bản ETABS, lý thuyết phân tích, hướng dẫn mô hình, quy ước kết quả, phần tử và ví dụ kiểm chứng ETABS |
| SAP2000 | [SAP2000 Help → Documentation](https://docs.csiamerica.com/help-files/sap/Menus/Help/Documentation.htm) | Phiên bản SAP2000, lý thuyết phân tích, hướng dẫn mô hình, quy ước kết quả, phần tử và ví dụ kiểm chứng SAP2000 |
| NexFEM | [Kế hoạch M0–M4](https://github.com/thai-coder/NexFEM/blob/main/docs/CSI_IMPORT_VALIDATION_PLAN.md) · [Nhập tệp CSI](../csi-import.md) | Liên kết từng quy tắc đã triển khai với kiểm thử tương ứng |

Các trang Help công khai xác nhận đường tra cứu. Chúng chưa xác nhận công thức, giả thiết hoặc phiên bản của bộ tài liệu dự án.

## Cách lưu ghi chú để tra lại

1. Lập danh sách PDF, mã mẫu và mô hình kèm theo. Ghi sản phẩm, phiên bản, tên tệp, liên kết gốc và phiên bản hoặc mã băm của tệp. Nếu tài liệu không ghi phiên bản, để trạng thái chờ xác minh.
2. Làm theo từng chủ đề. Ưu tiên phần tử khung, trục địa phương, đơn vị, vị trí lấy nội lực, liên kết đầu thanh và tùy chọn phân tích liên quan benchmark M2. Đọc mục được trích dẫn và các mục nó dẫn chiếu. Kiểm tra bảng, hình và công thức trên trang gốc trước khi ghi quy tắc. Đọc mã mẫu để nhận diện hành vi API và phiên bản tương ứng.
3. Lưu một ghi chú cho mỗi quy tắc độc lập, trong mục lục đúng sản phẩm. Giữ nguồn nội bộ trong tài liệu có quyền đọc phù hợp. Đưa lên repo công khai phần diễn giải và các nguồn được phép công khai.
4. Tách trạng thái **Đã đọc nguồn**, **Đã triển khai** và **Đã đối chiếu kết quả**. Cập nhật từng trạng thái theo bằng chứng có sẵn. Khi mở lại công việc, mở ghi chú theo chủ đề trước rồi tra trang gốc nếu cần quyết định kỹ thuật.

Mỗi ghi chú có các trường sau.

| Trường | Ghi gì |
| --- | --- |
| Sản phẩm và phiên bản | ETABS hoặc SAP2000, phiên bản được nguồn ghi rõ |
| Nguồn | Tên PDF hoặc mã mẫu, liên kết, chương/mục và trang in hoặc số trang PDF |
| Phạm vi | Phần tử, loại phân tích, đơn vị, trục và điều kiện áp dụng |
| Quy tắc | Công thức được diễn giải lại, giả thiết, dấu và ngoại lệ có liên quan |
| Kiểm thử | Mô hình, bảng kết quả gốc của đúng sản phẩm, thành phần so sánh và dung sai có lý do |
| Trạng thái | Đã đọc nguồn, đã triển khai, đã đối chiếu hoặc còn thiếu bằng chứng |

## Yêu cầu cho chế độ phân tích

- Mỗi lần chạy dùng đúng một chế độ tương thích ETABS hoặc SAP2000 khi hai chế độ được triển khai. Bộ kiểm tra và bộ giải phải nhận chế độ rõ ràng. Các quy tắc đặc thù, mặc định và dữ liệu kiểm chứng của chế độ này không được áp dụng trong chế độ kia. Toán và mã dùng chung chỉ đưa vào phần chung khi phạm vi áp dụng đã được kiểm chứng riêng cho cả hai sản phẩm.
- Tách xuất xứ tệp khỏi chế độ chạy. Nhập `.e2k` hoặc `.s2k` ghi chương trình và phiên bản gốc nếu có. Đổi chế độ phải có bước xem trước các thuộc tính giữ được, đổi được và chưa hỗ trợ. Các thay đổi ảnh hưởng kết quả cần được xác nhận trước khi ghi dữ liệu chuyển đổi. Hồ sơ `.nxf` cũ vẫn có đường mở và nâng cấp rõ ràng, giữ thông tin nguồn nếu đã biết.
- Kiểm tra chế độ ở trước F5 và tại đầu vào bộ giải. Nếu quy tắc hoặc dữ liệu chưa được hỗ trợ trong đích, báo rõ đối tượng và lý do, rồi dừng chạy chế độ đó. Chế độ mới cần giải lại. Kết quả phải gắn với chế độ, phiên bản quy tắc và mô hình đã phân tích để phần hiển thị nhận ra kết quả cũ.
- Nghiệm thu riêng từng chế độ trên tệp và bảng kết quả độc lập của đúng sản phẩm. Thêm ca chống trộn quy tắc, ca đổi chế độ khi đang có kết quả và ca mở `.nxf` cũ. So sánh chuyển vị, phản lực, nội lực theo station và quy ước dấu trước khi coi một chế độ có thể sử dụng.

## Checkpoint

- NexFEM, 16/11/2026 (UTC+7). Base `7669db8`. Nhánh làm việc `codex/csi-help-and-analysis-modes`. Đã đọc các mục ưu tiên cho M2 từ bộ nguồn được ghim tại `4f162a7` trên `main`.
- Help bổ sung hướng dẫn NexFEM qua F1, mục Tài liệu và liên kết chính thức theo sản phẩm. [PR #19](https://github.com/thai-coder/NexFEM/pull/19) tiếp tục giữ bộ benchmark giải tích và phần đối chiếu M2 đang chờ dữ liệu CSI.
- Hành động đầu tiên khi tiếp tục M2 là dựng hai ca kiểm chứng được ghi trong [ghi chú phân tích khung](CSI_FRAME_REFERENCE_NOTES.md), rồi lấy mô hình và các bảng kết quả xuất độc lập từ đúng phiên bản CSI. Chỉ bật chế độ phân tích sau khi xác minh và kiểm thử các quy tắc tương ứng.
