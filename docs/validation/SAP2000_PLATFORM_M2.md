# M2 — SAP2000 Platform 2nd use

Benchmark trên mô hình [Platform 2nd use](https://github.com/thai-coder/NexFEM/tree/f2df3ae400910a3a07d693d620133ae0b2fd5924/Analyze.Sap2000), SAP2000 26.2.0, kip–in–°F. SHA-256 S2K `60ee53086250bd226acf10c5ae7cdefee138ea49da83ef10dcdc4df1a528a013`. Importer được chạy trên mã PR #19 tại `845ffc91e3ec320d515a6c7e9dfb1e2d0283bf3c`, gồm chính sách chặn của PR #21. Các workbook khớp SHA-256 trong con trỏ Git LFS của commit nguồn. Chưa có định danh xác nhận S2K và workbook là cùng lần chạy.

## Mức 1 — Cân bằng tải nguồn với phản lực đáy SAP2000

Với DEAD/LIVE, lấy tự trọng từ `MATERIAL LIST 1 - BY OBJECT TYPE` nhân hệ số pattern, cộng áp lực trọng lực nhân `AreaArea` của từng gán uniform và uniform-to-frame. Đây là sổ cái tải theo diện tích hình học. Diện tích hữu hiệu và phép phân tải thực tế của SAP2000 chưa được kiểm chứng. Với EQX/EQY, cộng từng tải nút tường minh trong S2K trên toàn bộ nút phân tích, gồm các nút lưới không có ID object. Bốn case tĩnh đều dùng pattern cùng tên với hệ số 1. Quy ước so sánh là `phản lực dự kiến = -tổng tải` trong hệ toàn cục, chỉ kiểm tra lực, không tính mô men đáy.

| Case | Thành phần | Phản lực dự kiến (kip) | SAP2000 (kip) | Chênh tuyệt đối (kip) | Chênh tương đối | Kết quả |
|---|---|---:|---:|---:|---:|---|
| DEAD | FZ | 847,095944 | 846,915 | 0,180944 | 0,021365% | Cần giải thích |
| LIVE | FZ | 984,859744 | 984,497 | 0,362744 | 0,036846% | Cần giải thích |
| EQX | FX | −490,246712 | −490,247 | 0,000288 | 0,0000587% | Khớp trong dung sai |
| EQY | FY | −490,246712 | −490,247 | 0,000288 | 0,0000587% | Khớp trong dung sai |

Dùng dung sai tuyệt đối **0,0005 kip**, bằng nửa bước 0,001 kip của các thành phần phản lực chính trong bản xuất. Không cộng dung sai tương đối. Áp cùng ngưỡng tuyệt đối để kiểm các thành phần gần 0, nơi phần trăm do chia cho nhiễu số không có ý nghĩa thực tế. Tám thành phần phụ đều nằm trong ngưỡng. Ngưỡng này dùng để đối chiếu số liệu xuất, không dùng làm ngưỡng nghiệm thu chuyển vị/nội lực. [Kết quả đủ 12 thành phần](../../tests/benchmarks/csi/platform/platform-m2.json)

## Báo cáo nhập

| Nhóm | Nguồn → nhập | Ghi chú |
|---|---:|---|
| Nút object | 3.573 → 3.573 | SAP2000 xuất chuyển vị 4.210 nút phân tích mỗi case tĩnh |
| Thanh object | 2.447 → 2.407 | Bỏ 40 thanh tiết diện góc; sau chia NexFEM có 5.263 đoạn |
| Area object | 77 → 77 | Bảng SAP2000 có 1.015 phần tử area sau chia lưới; không suy số phần tử từ số object |
| Link | 2 định nghĩa | Không thấy bảng connectivity link trong S2K; chưa có bằng chứng hai định nghĩa đã được gán |
| Tải diện | 24 gán uniform đã đọc; 124 uniform-to-frame bị chặn | Cả hai nhóm được tổng hợp riêng trong Mức 1 |
| Tải EQ | 7.800 dòng bị chặn | 3.900 dòng mỗi case; bảng này được đọc riêng để benchmark |

Cờ `report.blocked=true`. Chẩn đoán gồm 3.765 thành phần bán cứng không hỗ trợ, 4.503 thành phần xấp xỉ khớp, 1.238 cảnh báo điểm chèn và 7 cảnh báo đặc trưng tiết diện. File cũng chứa đoạn lệch ở đầu thanh; ví dụ thanh 1 có 2,952756 in mỗi đầu. Cần xác minh ảnh hưởng lên vị trí trích nội lực và chiều dài phân tích.

## Mức 2 — Phạm vi đối chiếu

| Chỉ số | Trạng thái trên Platform | Điều kiện để đối chiếu |
|---|---|---|
| Chuyển vị nút DEAD/LIVE/EQX/EQY | Not comparable | Tương đương độ cứng shell, độ cứng liên kết và tải; ghép nút object/nút chia lưới |
| Phản lực gối và nội lực thanh | Not comparable | Tương đương mô hình; thống nhất trục, dấu, phần tử, vị trí station và đoạn lệch đầu |
| MODAL (12 mode) | Not comparable | Hỗ trợ bài toán modal và nguồn khối lượng tương đương |

Đã dựng CSV tải nút tường minh EQX/EQY từ S2K ở độ chính xác gốc, giữ ID phần tử và ID object riêng. Mỗi case có 3.263 dòng ghép được theo ID object và 637 dòng tải khác 0 chưa ghép được. Tổng lực chưa ghép là **72,377951 kip mỗi case (14,76%)**. Cần ánh xạ nút chia lưới hoặc quy đổi lực và mô men bảo toàn tương đương. Không dùng phần tải thiếu để chạy mô hình đã bị chặn.

Nhật ký chênh lệch:

- **Ánh xạ khi nhập.** Tải đều truyền sang frame, tải động đất tường minh và các thanh góc chưa được tạo đúng. Điểm chèn và đặc trưng tiết diện có sai khác đã ghi.
- **Giả định mô hình và rời rạc hoá.** Chưa có độ cứng shell, chia lưới và bán cứng tương đương. Chênh DEAD/LIVE đã xuất hiện khi so sổ cái nguồn với dữ liệu SAP2000, trước khi chạy NexFEM. Cần kiểm tra diện tích hữu hiệu/phân tải và xác nhận cùng lần chạy trước khi quy nguyên nhân.
- **Sai số số học của bộ giải.** Chưa đo được trên Platform. Hai chỉ số EQ đạt ở Mức 1 chỉ kiểm tra hợp lực tải nguồn. Chưa đặt ngưỡng chuyển vị, phản lực nút hoặc nội lực khi chưa có case đủ điều kiện.

## Tái lập

Từ checkout của PR này, sau khi cài phụ thuộc dự án, dùng Node 24 và Python 3.11+ có `openpyxl==3.1.5`. Trong clone chứa commit nguồn, checkout `f2df3ae` vào thư mục riêng và dùng `git lfs pull --include='Analyze.Sap2000/excel/*'` để lấy workbook thực. Các script xác minh SHA-256 và từ chối file khác, kể cả con trỏ LFS.

```bash
source_dir=/path/to/source/Analyze.Sap2000
out_dir=/tmp/nexfem-platform-m2
python scripts/validation/sap-platform-reference.py "$source_dir/excel" "$out_dir"
node --experimental-transform-types scripts/validation/sap-platform-m2.mjs \
  "$source_dir/Platform 2nd use.s2k" "$out_dir"
```

[CSV phản lực đáy](../../tests/benchmarks/csi/platform/base-reactions.csv) và [manifest](../../tests/benchmarks/csi/platform/reference.json) lưu kèm báo cáo. Năm CSV còn lại và CSV tải nút tường minh được tái tạo tại `out_dir`; riêng bảng nội lực gần 293 nghìn dòng. Manifest giữ khóa, đơn vị, bảng, commit và SHA-256 của từng workbook. Hai dòng ngoài dung sai được lưu trong JSON; lệnh hoàn tất khi sinh được báo cáo, chưa phải kiểm tra đạt toàn bộ benchmark.
