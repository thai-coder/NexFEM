# Thư viện thép hình

Cập nhật 13/11/2026. Chủ dự án chọn ba nguồn: **TCVN 7571**, **EN 10365** và **AISC Shapes Database**.

## Cách NexFEM dùng thư viện

1. Define ▸ Tiết diện thanh ▸ **Nạp thư viện thép (CSV)…**. Thư viện lưu trên máy người dùng (localStorage), không nằm trong file dự án và không nằm trong repo.
2. Mỗi dòng có **kích thước** (h, b, tw, tf, r cho chữ I; h, b, t cho hộp; d, t cho ống). NexFEM tự tính A, I33, I22, J bằng công thức đã kiểm tra (`docs/validation/SECTION_PROPERTIES.md`).
3. Nếu dòng có **giá trị bảng** (A, Iy, Iz, It), NexFEM so với giá trị tự tính và liệt kê tiết diện lệch quá ngưỡng: A, I ≤ 1 % (hộp ≤ 3 % vì chưa tính bán kính góc), J ≤ 5 %. Danh sách này giúp phát hiện lỗi gõ số liệu hoặc hình dạng mà công thức chưa mô tả đúng.
4. Ô **Thêm từ thư viện…** liệt kê tiết diện theo nhóm tiêu chuẩn · họ. Tiết diện thêm vào mô hình dùng vật liệu thép đầu tiên của mô hình.

Dòng lỗi (thiếu kích thước, hình chưa hỗ trợ) được báo theo số dòng và không được nạp.

## Định dạng CSV của NexFEM

Dòng đầu là tên cột. Dấu phẩy, hoặc dấu chấm phẩy kèm dấu thập phân phẩy (Excel cài tiếng Việt). Dòng bắt đầu bằng `#` là chú thích.

```csv
standard,family,name,shape,h,b,tw,tf,r,d,t,A,Iy,Iz,It
EN 10365:2017,IPE,IPE 300,I,300,150,7.1,10.7,15,,,53.81,8356,603.8,20.12
TCVN 7571-16:2017,I,<tên>,I,<h>,<b>,<tw>,<tf>,<r>,,,<A>,<Iy>,<Iz>,<It>
```

- Kích thước: mm. A: cm². Iy (trục mạnh), Iz, It: cm⁴. Các cột giá trị bảng có thể để trống.
- `shape`: `I` (cánh song song), `box`, `pipe`. Chưa hỗ trợ: chữ C/U, chữ L, chữ T, chữ I cánh vát (dòng loại này bị báo lỗi). Cần thêm hình mới vào mô hình và bộ giải trước.

## Bảng AISC lưu thành CSV

Mở file Excel AISC Shapes Database, chọn sheet dữ liệu, **Save As ▸ CSV (UTF-8)**, rồi nạp trực tiếp. NexFEM nhận ra bảng AISC qua cột `AISC_Manual_Label`, đổi inch sang mét, và:

- W, M, S, HP → chữ I với r = `kdes` − `tf`. Thép S có cánh vát nên chỉ gần đúng.
- HSS chữ nhật → hộp (h = `Ht`, b = `B`, t = `tdes`). HSS tròn và PIPE → ống (d = `OD`, t = `tdes`).
- C, MC, L, WT, 2L… bị bỏ qua.

Phần đọc bảng AISC mới được thử với dữ liệu mẫu tự tạo theo tên cột của AISC, **chưa thử với file AISC thật**. Khi có file, cần chạy lại và kiểm tra danh sách lệch.

## Nguồn dữ liệu và quyền sử dụng

| Nguồn | Tình trạng ngày 13/11/2026 | Việc cần làm |
| --- | --- | --- |
| **TCVN 7571-15/16** | Văn bản tiêu chuẩn có bản quyền, phải mua. Chưa có bản trong dự án. | Chủ dự án cung cấp bảng từ bản tiêu chuẩn đã mua; nhập vào CSV (dùng cho nội bộ). |
| **EN 10365:2017** | Văn bản CEN có bản quyền. [Điều khoản ArcelorMittal Sections](https://sections.arcelormittal.com/Terms_of_use_and_credits/EN): "The content may not be sold, distributed, transmitted, copied, modified or decompiled, in any way, without the prior written consent of ArcelorMittal." | Dùng bản tiêu chuẩn đã mua, hoặc xin văn bản đồng ý của nhà sản xuất nếu muốn đưa bảng vào NexFEM. |
| **AISC Shapes Database** | Trang aisc.org chặn truy cập tự động (403), nên chưa đọc được điều khoản và chưa tải được file. | Chủ dự án tải file Excel từ aisc.org bằng trình duyệt, đọc điều kiện sử dụng trên trang tải, rồi nạp CSV. |
| Dlubal (chỉ đối chiếu) | Không có giấy phép phân phối lại; tự ghi không bảo đảm độ chính xác. | Dùng để kiểm tra từng tiết diện, không sao chép. |

Kết luận: **repo công khai của NexFEM không chứa bảng thép của bên thứ ba** cho đến khi có văn bản cho phép. Bộ nhập CSV cho phép từng người dùng nạp bảng họ có quyền dùng. Nếu sau này có giấy phép phân phối (ví dụ AISC cho phép, hoặc bảng do dự án tự đo và công bố), có thể đưa file vào `resources/steel/` kèm ghi nguồn và giấy phép.

## Kiểm thử

- `packages/model-core/test/steel-library.test.ts`: đọc CSV (dấu phẩy, chấm phẩy và dấu thập phân phẩy), báo lỗi theo dòng, gắn cờ số liệu sai, bảng kiểu AISC.
- `tests/e2e/specs/steel-library.spec.ts`: nạp file, xem dòng lỗi và tiết diện lệch, thêm tiết diện từ thư viện, lưu sau khi tải lại, gỡ thư viện.
- File mẫu `tests/e2e/fixtures/steel-library-sample.csv` chỉ có hai tiết diện dùng để kiểm thử và hai dòng cố ý sai.
