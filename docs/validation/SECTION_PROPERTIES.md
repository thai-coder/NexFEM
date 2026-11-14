# Độ chính xác đặc trưng tiết diện thanh

Cập nhật 13/11/2026. Áp dụng cho `packages/model-core/src/sections.ts` (giao diện, kiểm tra mô hình) và `crates/fem-solver/src/analysis.rs` (bộ giải). Hai nơi dùng cùng công thức và cùng bộ test đối chiếu.

## Vấn đề đã phát hiện

Trước bản sửa này, tiết diện chữ I chỉ có `h, bf, tf, tw` và được tính như ba hình chữ nhật. Thép cán (IPE, HEA, HEB, W…) có **góc lượn chân bán kính r** giữa bụng và cánh. Bỏ qua góc lượn làm thiếu diện tích và độ cứng:

| Tiết diện | A | I33 (Iy) | I22 (Iz) | J (It) |
| --- | ---: | ---: | ---: | ---: |
| IPE 200 | −4,33 % | −5,01 % | −0,33 % | −26,0 % |
| IPE 300 | −3,59 % | −4,27 % | −0,18 % | −22,6 % |
| HEA 200 | −5,16 % | −4,94 % | −0,17 % | −29,0 % |
| HEB 300 | −4,21 % | −3,91 % | −0,12 % | −19,6 % |

Sai lệch so với bảng EN 10365:2017. Thiếu I33 làm võng và chuyển vị tầng tính ra lớn hơn thực tế khoảng 4–5 %; thiếu J ảnh hưởng nội lực xoắn và kết quả của các khung không gian.

## Cách sửa

- Thêm trường tuỳ chọn `r` (m) cho tiết diện chữ I. Bỏ trống hoặc `0` là tiết diện tổ hợp hàn, kết quả **giữ nguyên như cũ**, nên mô hình đã lưu không thay đổi.
- r > 0: cộng bốn góc lượn, mỗi góc là hình vuông r×r trừ một phần tư hình tròn bán kính r: diện tích (1 − π/4)r², trọng tâm cách hai cạnh thẳng r(10 − 3π)/(12 − 3π), mô men quán tính riêng (1 − 5π/16)r⁴ − A·e².
- J khi r > 0 theo El Darwish & Johnston (1965), công thức thường dùng cho bảng thép cán châu Âu.
- Hộp thoại Define ▸ Tiết diện thanh có thêm ô "Bán kính lượn chân r". Kiểm tra mô hình báo lỗi nếu 2(tf + r) ≥ h hoặc tw + 2r ≥ bf.

## Kết quả sau khi sửa

| Tiết diện | A | I33 | I22 | J |
| --- | ---: | ---: | ---: | ---: |
| IPE 200 | +0,01 % | +0,01 % | −0,02 % | −0,92 % |
| IPE 300 | 0,00 % | 0,00 % | 0,00 % | −1,00 % |
| HEA 200 | 0,00 % | 0,00 % | −0,04 % | +0,33 % |
| HEB 300 | −0,01 % | −0,02 % | 0,00 % | +2,26 % |

Test: `packages/model-core/test/sections-catalog.test.ts` và `crates/fem-solver/src/benchmarks.rs` (`rolled_sections`) yêu cầu A, I33, I22 lệch ≤ 0,1 % và J lệch ≤ 2,5 %.

Giá trị bảng dùng để đối chiếu (mm; cm², cm⁴): IPE 200 (200×100×5,6×8,5, r 12; A 28,48, Iy 1943, Iz 142,4, It 6,98), IPE 300 (300×150×7,1×10,7, r 15; 53,81, 8356, 603,8, 20,12), HEA 200 (190×200×6,5×10, r 18; 53,83, 3692, 1336, 20,98), HEB 300 (300×300×11×19, r 27; 149,1, 25170, 8563, 185,0). Các số này là giá trị catalogue EN 10365 phổ biến; **cần đối chiếu lại với bản tiêu chuẩn hoặc catalogue nhà sản xuất mà dự án chọn làm nguồn chính thức**.

## Các hình khác

| Hình | A, I | J | Ghi chú |
| --- | --- | --- | --- |
| Chữ nhật đặc | chính xác | Roark, sai ≤ 0,2 % so với lời giải chuỗi | có test |
| Tròn đặc, ống tròn | chính xác | chính xác | |
| Hộp (RHS/SHS) | chính xác với góc vuông | Bredt thành mỏng | **chưa tính bán kính góc** của ống hộp cán nóng/nguội: A và I hơi lớn hơn bảng; cần thêm bán kính góc khi có thư viện ống hộp |

Chưa có: mô đun dẻo Wpl, hằng số vênh Iw, diện tích chịu cắt tự động (hiện người dùng nhập A_s2, A_s3 nếu muốn tính biến dạng cắt). Những đại lượng này cần cho thiết kế (Giai đoạn 10) và ổn định, không ảnh hưởng bộ giải tuyến tính hiện tại.

## Nguồn dữ liệu bảng thép hình (mục 13)

Đã đọc trang [Dlubal Cross-Section Properties](https://www.dlubal.com/en/cross-section-properties/) ngày 13/11/2026:

- Trang là công cụ tra cứu trực tuyến, có rất nhiều thư viện: EN 10365:2017, DIN 1025, BS 4-1, AISC 13–16, CISC, AS/NZS 3679.1, GB/T, GOST, JIS, KS, IS, và **TCVN 7571-15:2006, TCVN 7571-16:2006/2017**; nhà sản xuất ArcelorMittal, British Steel, Tata Steel, Gerdau…
- Không thấy chức năng xuất hàng loạt (CSV/Excel/API) trên trang; dữ liệu nạp động khi xem từng tiết diện. Chưa xác định được có API hay không.
- [Legal Notice](https://www.dlubal.com/en/legal-notice/legal-notice): "The provider shall not guarantee that the information provided is up to date, correct, or complete, or for its quality." Không có điều khoản nào cấp quyền sao chép hay phân phối lại cơ sở dữ liệu.
- [General Terms and Conditions](https://www.dlubal.com/en/legal-notice/general-terms-and-conditions): "The software products as well as all online services of Dlubal Software GmbH are tools used to perform structural analysis and design. The correctness of calculations is the responsibility of the user."

Kết luận đề xuất: **không sao chép hàng loạt dữ liệu Dlubal vào NexFEM** (repo công khai, không có giấy phép phân phối lại, và Dlubal tự ghi không bảo đảm độ chính xác). Dùng Dlubal để **đối chiếu từng tiết diện**. Thư viện của NexFEM nên lấy **kích thước** (h, b, tw, tf, r) từ tiêu chuẩn hoặc catalogue nhà sản xuất có quyền dùng rõ ràng, rồi tự tính đặc trưng bằng công thức ở trên và kiểm tra lại với bảng. Chủ dự án cần chọn nguồn chính thức cho từng họ thép (ví dụ TCVN 7571, EN 10365, AISC Shapes Database) và xác nhận quyền sử dụng.
