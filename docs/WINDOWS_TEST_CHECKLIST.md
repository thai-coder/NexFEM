# Danh sách thử trên Windows

Dùng cho bộ cài của nhánh `claude/box-and-reports` (gồm toàn bộ PR #10–#13 và Giai đoạn 5–6.3 của Codex). Bộ cài nằm ở [Releases](https://github.com/thai-coder/NexFEM/releases) với tag **`test-box-and-reports`** (bản thử, đánh dấu pre-release), tạo bằng Actions ▸ CI ▸ Run workflow trên nhánh đó. Bản chính thức `v0.1.130` chỉ có phần của Codex, chưa có PR #10–#13. Ghi kết quả vào cột cuối rồi gửi lại cho Claude hoặc Codex. Mục nào lỗi, chụp màn hình và ghi phiên bản trong Help ▸ About.

## 0. Cài đặt
| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 0.1 | Chạy `-setup.exe` bằng quyền quản trị | Cài vào Program Files; thuộc tính file có Company `lkat.vn`, biểu tượng chữ N | |
| 0.2 | Mở NexFEM | Hiện splash (logo N, số phiên bản), sau ~2 giây hiện cửa sổ chính phóng to | |
| 0.3 | Cửa sổ chính | Có tab "Trang chủ" cạnh khung nhìn; bỏ chọn "Hiện trang này khi khởi động", đóng và mở lại thì không còn tab | |
| 0.4 | Đóng cửa sổ bằng nút X | Đóng được; nếu mô hình chưa lưu thì hỏi có/không | |

## 1. Mô hình mới hai bước (#10)
| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 1.1 | Ctrl+N | Hộp thoại "Bước 1/2 — Khởi tạo mô hình": tên, đơn vị, tiêu chuẩn | |
| 1.2 | Chọn đơn vị `tonf, m, C`, tick "Lưu ... làm mặc định", Tiếp, chọn "Trống", Tạo | Mô hình trống, đơn vị tonf | |
| 1.3 | Ctrl+N lần nữa | Có lựa chọn "Dùng thiết lập đã lưu của bạn", tóm tắt hiện `tonf, m, C` | |
| 1.4 | Chọn "Lấy thiết lập từ một file mô hình…", chọn một file `.nxf` đã lưu | Hiện đơn vị của file đó; Tiếp, Tạo thì mô hình mới có đơn vị đó | |
| 1.5 | Bước 2: chọn "Sàn phẳng", lưới 2@6 × 2@6, 2 tầng, Tạo | Có cột và sàn, không có dầm; ghi chú về độ cứng sàn trong hộp thoại và trong log | |
| 1.6 | Chọn "Sàn phẳng có dầm biên", cùng lưới | Dầm chỉ ở chu vi | |
| 1.7 | Chọn "Lưới đều" + "Tầng đơn giản" (4 nhịp × 5 m, 4 tầng, 3,5 m, tầng dưới 4,2 m) | Thanh trạng thái ở chân hộp thoại ghi "4 × 2 nhịp, 4 tầng, cao 14.70 m" | |
| 1.8 | Với mỗi mẫu sàn phẳng: F5 | "Phân tích xong"; chỉ dùng cho tải đứng | |

## 2. Tuỳ chọn hiển thị theo cửa sổ (#11)
| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 2.1 | Bấm ⚙ ở đầu ô Plan; bỏ chọn Dầm và Sàn; OK | Chỉ ô Plan mất dầm và sàn; ô 3D vẫn đủ | |
| 2.2 | Kéo khung chọn trong ô Plan | Không chọn được dầm/sàn đã ẩn | |
| 2.3 | Mở lại ⚙, tick "Áp dụng cho tất cả cửa sổ", bỏ "Lưới trục", OK | Mọi ô mất lưới trục | |
| 2.4 | Menu View ▸ Hiện nhãn nút khi đang chọn ô 3D | Chỉ ô 3D hiện nhãn nút | |
| 2.5 | Thoát hẳn app, mở lại | Mỗi ô giữ tuỳ chọn riêng | |

## 3. Tiết diện thép (#12, #13 và bản này)
| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 3.1 | Define ▸ Tiết diện thanh ▸ Thêm, "Chữ I", h 0,3, bf 0,15, tf 0,0107, tw 0,0071, r 0 | A = 5.188e-3 m² (thiếu so với bảng IPE 300: 5.381e-3) | |
| 3.2 | Đổi r thành 0,015 | A = 5.381e-3 m² (bảng IPE 300: 53,81 cm²), I33 = 8.356e-5 m⁴ | |
| 3.3 | "Hộp", h 0,2, b 0,2, t 0,01, r 0 rồi r 0,02 | A = 7.600e-3 rồi 7.342e-3 m² | |
| 3.4 | "Nạp thư viện thép (CSV)…", chọn `tests/e2e/fixtures/steel-library-sample.csv` (lấy từ repo) | "3 tiết diện; đối chiếu được 3, lệch quá ngưỡng 1"; "1 dòng không đọc được"; "IPE 300 sai" nằm trong danh sách lệch | |
| 3.5 | "Thêm từ thư viện…" ▸ HEB 300 | Tạo tiết diện có r = 0,027 | |
| 3.6 | Nạp file CSV AISC thật (nếu bạn có), xem danh sách lệch | Ghi lại tiết diện nào lệch và bao nhiêu % | |

## 4. Tab Reports (bản này)
| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 4.1 | Model Explorer ▸ tab Reports ▸ "Tiết diện thanh" | Bảng có A, I33, I22, J theo đơn vị mô hình | |
| 4.2 | Đổi đơn vị mô hình sang `N, mm, C` rồi mở lại báo cáo | Số và đơn vị cột đổi theo (A tính bằng mm²) | |
| 4.3 | Bấm "Xuất CSV…" | Hộp thoại lưu của Windows; mở file bằng Excel thấy tiếng Việt đúng dấu | **Lệnh lưu của bản desktop chưa thử trên máy thật** | |
| 4.4 | Bấm "Sao chép" rồi dán vào Excel | Dán thành các dòng | |

## 5. Kết quả phân tích (Codex, PR #8)
| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 5.1 | F5; chọn case trên thanh công cụ | Bảng chuyển vị, phản lực, nội lực đổi theo case | |
| 5.2 | Display ▸ Biến dạng, đổi hệ số | Hình biến dạng trên 3D, mặt bằng, mặt đứng | |
| 5.3 | Display ▸ Biểu đồ M3 rồi M2; chọn thanh | Biểu đồ và bảng station; M2 ↔ M3 chuyển được | |
| 5.4 | Display ▸ Chạy biến dạng; F6 | Chạy lặp, F6 dừng và xoá kết quả | |
| 5.5 | Đối chiếu SAP2000 | Cần bảng nội lực xuất từ SAP2000 (Frame, Output Case, Station, M2, đơn vị, trục địa phương); chưa có | |

## 6. Lưu và mở
| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 6.1 | Tạo mô hình có tiết diện chữ I `r` 0,015 và ống hộp `r` 0,02; Ctrl+S, đóng, mở lại | Giữ nguyên `r`, A giống trước | |
| 6.2 | Mở file `.nxf` cũ (trước bản này) | Mở bình thường; tiết diện chữ I cũ có r = 0 | |
