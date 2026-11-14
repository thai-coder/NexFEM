# Vòng cải thiện giao diện 3: theo mẫu ETABS

Cập nhật: 07/11/2026

Nguồn: ảnh chụp ETABS do người dùng cung cấp (splash, Start Page, Model Initialization, New Model Quick Templates, Set View Options, cửa sổ làm việc). NexFEM bám **cách làm việc** của ETABS/SAP2000, không dùng hình ảnh, logo hay thương hiệu của CSI. Splash và bộ cài dùng logo chữ N của NexFEM.

## Quyết định đã chốt (07/11/2026)
- Bỏ ribbon; dùng menu + một hàng thanh công cụ + thanh công cụ dọc bên trái.
- Cho phép chọn chữ trong log/thông báo; khoá chọn chữ ở mọi chỗ khác (trừ ô nhập).
- Dùng logo hiện tại cho splash và cho bộ cài.
- **Giai đoạn 6 chỉ làm khi người dùng xác nhận.**

## Tình trạng

| # | Hạng mục | Độ khó | Trạng thái |
| --- | --- | --- | --- |
| 1 | Khoá chọn chữ (trừ ô nhập, log, thông báo) | Đơn giản | ✅ |
| 2 | Ký hiệu gối to, rõ, tỉ lệ theo zoom; công tắc "Hiện gối" | Đơn giản | ✅ |
| 3 | Bảng không bung quá cỡ khi bật/tắt (giới hạn kích thước từng bảng) | Đơn giản | ✅ |
| 4 | Ô "Một tầng / Tầng tương tự / Tất cả" ở thanh trạng thái | Đơn giản | ✅ |
| 5 | Bỏ ribbon → menu + thanh công cụ + thanh dọc | Trung bình | ✅ |
| 6 | Nút gom nhóm cùng họ (Dầm/Cột/Giằng, Sàn/Vách, Define, Assign, Bố cục) | Trung bình | ✅ |
| 7 | Hộp thoại Assign không chặn khung nhìn (chọn đối tượng trước hoặc sau) | Trung bình | ✅ |
| 8 | Hình bộ cài (NSIS, WiX) và biểu tượng dùng logo chữ N | Đơn giản | ✅ |
| 9 | Splash khi mở app (logo NexFEM) | Đơn giản | ✅ Xong (cửa sổ splash riêng, tối thiểu 1,6 s, tự đóng khi giao diện sẵn sàng; watchdog 25 s) |
| 10 | Start Page là một tab: Mô hình mới / Mở / Gần đây / "Hiện khi khởi động" | Trung bình | ✅ Xong (tab "Trang chủ" cạnh khung nhìn, lệnh File ▸ Trang chủ; chạy tự động mặc định tắt) |
| 11 | New Model hai bước: Initialization (đơn vị, vật liệu theo vùng, CSDL thép hình, tiêu chuẩn; dùng thiết lập đã lưu hoặc lấy từ file mô hình) rồi Quick Templates (lưới đều/tuỳ chỉnh, tầng đơn giản/tuỳ chỉnh) | Trung bình | ✅ Xong (bước 1: tên, đơn vị, tiêu chuẩn từ thiết lập có sẵn / đã lưu / một file mô hình; bước 2: mẫu, lưới đều hoặc tuỳ chỉnh, tầng đơn giản hoặc tuỳ chỉnh). Chưa có: vật liệu theo vùng và CSDL thép hình (cần nguồn bảng thép) |
| 12 | Mẫu: sàn phẳng, sàn phẳng có dầm biên | Đơn giản | ✅ Xong, có giới hạn: sàn chưa có độ cứng shell, tải sàn chuyển thẳng về cột (chỉ dùng cho tải đứng) cho đến Giai đoạn 9 |
| 13 | Mẫu thép + sàn deck (cần CSDL thép hình) | Trung bình | ⏳ cần nguồn bảng thép hình |
| 14 | Mẫu waffle, sàn sườn, giàn so le (cần phần tử shell) | Phức tạp | ⏳ sau Giai đoạn 9 |
| 15 | Hộp thoại Set View Options theo từng view (+ "Apply to All Windows") | Trung bình | ✅ Xong (nút ⚙ trên mỗi cửa sổ, View ▸ Tuỳ chọn hiển thị…, menu chuột phải; ẩn theo loại đối tượng, nhãn, gối, nhả liên kết, tải, lưới, tô màu sàn; "Áp dụng cho tất cả cửa sổ"; lệnh nhanh trong menu View áp dụng cho cửa sổ đang hoạt động) |
| 16 | Model Explorer thêm tab Reports | Trung bình | ⏳ cùng Giai đoạn 6 |
| 17 | Khung nhìn là panel dock riêng (đóng/mở từng view, kéo ra màn hình khác) | Trung bình–Phức tạp | ⏳ |

## Ghi chú
- Cửa sổ Assign mở lên là kéo được, không có lớp phủ; số đối tượng đang chọn cập nhật ngay khi bấm chọn trong khung nhìn. OK đóng cửa sổ, Áp dụng giữ mở. Phím tắt và thao tác xoay/phóng to vẫn dùng được khi cửa sổ mở.
- Ở mặt bằng, đầu cột nằm trùng nút nên bấm vào đó chọn cột trước; dùng bộ lọc "Chọn: Nút / Thanh / Sàn" ở thanh trạng thái để chỉ chọn nút.
- Ký hiệu gối nằm ở chân công trình: xem ở mặt đứng, 3D hoặc mặt bằng tầng Base.
