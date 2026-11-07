# Đánh giá và kế hoạch: vòng cải thiện giao diện sau Giai đoạn 5

Cập nhật: 07/11/2026

Phạm vi: 13 yêu cầu từ lần chạy thử đầu tiên trên máy người dùng. Mỗi mục được xếp theo độ phức tạp.
**Đơn giản** = làm trong một lần, không đổi kiến trúc. **Trung bình** = cần thành phần mới nhưng dùng lại nền hiện có.
**Phức tạp** = đổi kiến trúc hoặc cần dữ liệu/thử nghiệm mà môi trường phát triển chưa có.

Giai đoạn 6 (hiển thị kết quả) tạm hoãn đến khi các mục "Đơn giản" và "Trung bình" bên dưới xong.

## Tổng quan

| # | Yêu cầu | Độ phức tạp | Trạng thái |
| --- | --- | --- | --- |
| 1 | Chưa đóng được ứng dụng | Đơn giản (lỗi quyền) | ✅ Đã sửa, CI tự kiểm tra |
| 2 | Giao diện chiếm quá nhiều chỗ của khung nhìn | Đơn giản | ✅ Đã làm |
| 3 | Bảng thuộc tính tắt đi thì mở lại ở đâu | Đơn giản | ✅ Đã làm |
| 4 | Kéo khung nhìn ra nhiều màn hình | **Phức tạp** | ⏳ Kế hoạch (cần thử nghiệm) |
| 5 | Giảm chiều cao ribbon | Đơn giản | ✅ Đã làm (149 → 73 px) |
| 6 | Chọn tiêu chuẩn khi tạo dự án | Đơn giản (chọn) / Phức tạp (tính theo tiêu chuẩn) | ✅ Phần chọn · ⏳ Phần tính: Giai đoạn 10 |
| 7 | Dashboard / trang bắt đầu | Trung bình | ⏳ Kế hoạch, làm tiếp theo |
| 8 | Mở file ETABS/SAP2000 | **Phức tạp** | ⏳ Cần file mẫu từ người dùng |
| 9 | Mô hình trên 100.000 đối tượng | Trung bình (giao diện) · **Phức tạp** (bộ giải) | ⏳ Đã đo; kế hoạch tối ưu |
| 10 | Điểm nút | Đơn giản – Trung bình | ✅ Đã làm |
| 11 | Chỉnh sửa trục lưới | Đơn giản (mở hộp thoại) · Trung bình (kéo bằng chuột) | ✅ Phần 1 · ⏳ Phần 2 |
| 12 | Đổi nhãn đối tượng | Đơn giản | ✅ Đã làm |
| 13 | Chuột phải để mở chức năng/thông tin | Trung bình | ✅ Đã làm cho khung nhìn và cây mô hình |

## Chi tiết từng mục

### 1. Không đóng được ứng dụng — ✅
- **Nguyên nhân:** khi app đăng ký xử lý sự kiện đóng cửa sổ (để hỏi lưu), Tauri đóng tiếp bằng lệnh `destroy`; lệnh này cần quyền `core:window:allow-destroy` mà quyền mặc định không có. Nút X vì vậy không có tác dụng.
- **Đã làm:** thêm quyền `allow-close`/`allow-destroy`; hộp hỏi "bỏ thay đổi chưa lưu" chuyển sang hộp thoại của hệ điều hành (hộp `confirm` của trình duyệt không đáng tin trong WebView2).
- **Kiểm tra:** CI Windows có bước mới: mở app đã cài, tự bấm đóng cửa sổ như người dùng, yêu cầu app thoát sạch trong 90 giây. Mình chưa tự thử được trên Windows, nên bản này cần người dùng xác nhận lại.

### 2, 3, 5. Chiếm chỗ, mở lại bảng, ribbon — ✅
- Ribbon gọn là mặc định: cao 73 px (trước 149 px); bấm nút ở góc ribbon hoặc View → "Ribbon gọn" để quay lại bản đầy đủ. Ctrl+F1 vẫn thu hẳn ribbon.
- Các bảng mặc định hẹp hơn (Model Explorer 220, Properties 270 px, Console cao 150 px); thanh tiêu đề khung nhìn thấp hơn.
- **Chế độ tập trung** (Ctrl+Shift+F hoặc nút ở thanh trạng thái): ẩn mọi bảng và ribbon, bấm lại để khôi phục đúng như trước.
- **Mở lại bảng đã tắt:** ba nút Model Explorer / Properties / Console ở góc phải thanh trạng thái (luôn hiện), menu View, phím F2/F4/F8, hoặc bảng lệnh Ctrl+Shift+P.

### 4. Kéo khung nhìn sang màn hình khác — phức tạp
- Dockview có "nhóm nổi" trong cửa sổ và "cửa sổ rời" (popout). Cửa sổ rời dùng `window.open` rồi dời DOM sang cửa sổ mới; chưa rõ chạy ổn trong WebView2 của Tauri (đồng bộ trạng thái, WebGL, phím tắt, đóng cửa sổ).
- **Kế hoạch:** (a) thử nghiệm nhanh popout của Dockview trong Tauri trên Windows; (b) nếu không ổn, làm đúng cách: mở cửa sổ Tauri thứ hai chỉ chứa một khung nhìn, đồng bộ mô hình qua sự kiện Tauri giữa các cửa sổ (kho mô hình hiện nằm trong một cửa sổ). Cách (b) cần thiết kế lại cầu nối trạng thái nên xếp vào mục Phức tạp.

### 6. Chọn tiêu chuẩn khi tạo dự án — ✅ phần chọn
- Hộp thoại "Mô hình mới" có ba ô: bê tông cốt thép, kết cấu thép, tải trọng (TCVN, Eurocode, ACI/AISC/ASCE 7). Đổi sau trong Tools → Tuỳ chọn. Lựa chọn lưu trong file `.nxf`.
- **Cần nói rõ:** hiện mới *lưu* lựa chọn; các phép kiểm tra thiết kế theo tiêu chuẩn chưa có (Giai đoạn 10, theo `docs/design-codes.md`).

### 7. Dashboard — trung bình, làm tiếp theo
- Trang bắt đầu kiểu ETABS/SAP2000: mô hình mới theo mẫu, mở file, danh sách file gần đây, mở mô hình mẫu, liên kết tài liệu. Dùng lại hộp thoại "Mô hình mới" và danh sách file gần đây đã có.
- Hiển thị khi mở app lần đầu và qua menu File → Trang bắt đầu.
- Ước lượng: một lần làm việc ngắn. Chưa có "dashboard kết quả" (tóm tắt kiểm tra, drift, tỉ số ứng suất): thuộc Giai đoạn 6 và 10.

### 8. Mở file ETABS/SAP2000 — phức tạp
- Các file văn bản `.e2k`/`.s2k` gồm nhiều bảng có cú pháp riêng, khác nhau theo phiên bản; chưa có file mẫu thật trong môi trường phát triển, nên viết bộ đọc theo trí nhớ sẽ dễ sai.
- **Cần người dùng cung cấp** vài file `.e2k` và `.s2k` thật (mô hình nhỏ, ghi rõ phiên bản ETABS/SAP2000), nên có cả bản khung đơn giản và bản có sàn, tải, tổ hợp.
- **Kế hoạch:** bắt đầu với nút, thanh, vật liệu, tiết diện chữ nhật/I, tầng, lưới, mẫu tải, tải thanh/sàn; báo rõ phần chưa đọc được; sau đó mới xuất ngược. Tách thành phiên bản riêng (v0.2) như `docs/ROADMAP.md`.

### 9. Mô hình trên 100.000 đối tượng — đã đo

Đo trên máy cloud (giả lập card đồ hoạ bằng phần mềm, nên trên máy thật nhanh hơn).

| Mô hình | Đối tượng | Mở file + dựng | Rê chuột (pick) | Kéo khung chọn | Một lệnh vẽ | Bộ giải |
| --- | --- | --- | --- | --- | --- | --- |
| 5×5, 10 tầng | 1.606 | — | — | — | 23 ms | 0,4 giây |
| 10×10, 20 tầng | 11.361 | — | — | — | 72 ms | **10,6 giây** |
| 14×14, 25 tầng | 26.875 | 0,9 giây | — | — | 85 ms | **57 giây** (273 MB) |
| 30×30, 40 tầng | **188.241** | 1,1 giây | 13 ms | 141 ms | 490 ms | **không giải được** |

Kết luận:
- **Hiển thị và chọn: chạy được** ở 188 nghìn đối tượng (mở file khoảng 1 giây, rê chuột 13 ms). Cần kiểm tra lại trên máy Windows thật có card đồ hoạ.
- **Chỉnh sửa: chậm dần.** Mỗi lệnh vẽ tốn khoảng 0,5 giây ở 188 nghìn đối tượng vì tìm nút trùng và sao chép mảng đều tuyến tính theo số đối tượng. Sửa được (chỉ mục không gian cho nút).
- **Bộ giải: là điểm nghẽn thật.** Thời gian và bộ nhớ tăng rất nhanh (11 nghìn đối tượng: 10 giây; 27 nghìn: 57 giây), mô hình 188 nghìn đối tượng cần hàng chục GB và vượt giới hạn 4 GB của WebAssembly. Cần bộ giải thưa.

Kế hoạch tối ưu (xếp theo thứ tự làm):
1. *(trung bình)* Chỉ mục không gian cho `findOrAddJoint` và kiểm tra trùng; cập nhật theo lô thay vì từng đối tượng. Mục tiêu: lệnh vẽ dưới 50 ms ở 200 nghìn đối tượng.
2. *(trung bình)* Cây Model Explorer chỉ dựng nút khi mở nhánh (ảo hoá); bảng dữ liệu đã giới hạn số dòng.
3. *(phức tạp)* **Bộ giải thưa:** phân tích Cholesky thưa với thứ tự giảm điền đầy (AMD/nested dissection), chạy trong tiến trình Rust gốc của Tauri thay vì WebAssembly (không bị giới hạn 4 GB, dùng được nhiều nhân CPU); giữ bản WebAssembly cho mô hình nhỏ và bản trình duyệt. Có thể thêm lựa chọn giải lặp (PCG) cho mô hình rất lớn. Mục tiêu: 100 nghìn đối tượng giải trong vài chục giây.
4. *(trung bình)* Chạy bộ giải trong luồng nền (Web Worker / lệnh Tauri không đồng bộ) để giao diện không bị treo và có thanh tiến trình, có nút Huỷ.
5. *(phức tạp, nếu cần)* Vẽ bằng instancing/LOD khi zoom xa và chỉ mục chọn không gian, nếu đo trên máy thật vẫn giật.

### 10. Điểm nút — ✅
- Kéo khung chọn giờ chọn cả nút; **bộ lọc loại đối tượng** (Nút / Thanh / Sàn) ở thanh trạng thái để chỉ chọn nút khi cần gán gối.
- View → Hiện nút / Hiện nhãn nút / Hiện nhãn thanh (nhãn chỉ hiện khi dưới 1.500 đối tượng trong khung nhìn).
- Properties của nút sửa được nhãn và toạ độ X, Y, Z (thanh và sàn nối vào nút tự đi theo; báo lỗi nếu trùng vị trí nút khác).
- "Chọn tất cả" chọn cả nút.

### 11. Chỉnh sửa trục lưới — ✅ phần 1
- Chuột phải vào trục lưới hoặc đường cao độ tầng, hoặc bấm đúp vào đó, mở hộp thoại Lưới trục & Tầng (đã có từ Giai đoạn 2: sửa toạ độ/khoảng cách, thêm xoá trục, nút đi theo trục). Define → Lưới trục… vẫn dùng được.
- **Phần 2 (trung bình, chưa làm):** kéo trục bằng chuột trực tiếp trên khung nhìn, thêm trục bằng cách bấm vào vị trí, đổi tên bằng bấm đúp vào bong bóng.

### 12. Đổi nhãn — ✅
- Properties: ô "Nhãn" của nút, thanh, sàn (Enter hoặc rời ô để lưu). Chuột phải → "Đổi nhãn…". Nhãn không được rỗng và không được trùng trong cùng loại (không phân biệt hoa thường), có báo lỗi ngay.
- Chưa có: đổi nhãn hàng loạt theo mẫu (ví dụ B1, B2…), đổi nhãn bằng F2 trong cây mô hình.

### 13. Chuột phải — ✅
- Khung nhìn: chuột phải vào đối tượng chọn nó (nếu chưa chọn) và hiện menu: thông tin/thuộc tính, đổi nhãn, các lệnh Assign phù hợp loại đối tượng, nhân bản, xoá; ở trục lưới có "Sửa lưới trục…"; luôn có vừa khung, chọn tất cả, bỏ chọn, bỏ công cụ vẽ. Kéo chuột phải để xoay 3D thì không hiện menu.
- Cây Model Explorer: chuột phải chọn nhóm đối tượng và hiện cùng menu, thêm mục mở hộp thoại định nghĩa.
- Chưa có menu chuột phải cho bảng dữ liệu và Console.

## Thứ tự làm tiếp (đề xuất)

1. **Vòng 2a — trung bình:** dashboard/trang bắt đầu (#7); chỉ mục nút và cây ảo hoá (#9.1–9.2); kéo trục bằng chuột (#11 phần 2); menu chuột phải cho bảng dữ liệu.
2. **Vòng 2b — cần dữ liệu:** bộ đọc `.e2k`/`.s2k` (#8) sau khi có file mẫu.
3. **Vòng 2c — phức tạp:** bộ giải thưa chạy gốc + luồng nền (#9.3–9.4); thử nghiệm cửa sổ rời nhiều màn hình (#4).
4. Sau đó mới tới **Giai đoạn 6** (biến dạng, biểu đồ M/V/N, drift, xuất Excel/CSV).
