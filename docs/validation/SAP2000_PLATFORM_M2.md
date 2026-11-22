# M2 — SAP2000 Platform 2nd use

Benchmark trên mô hình [Platform 2nd use](https://github.com/thai-coder/NexFEM/tree/f2df3ae400910a3a07d693d620133ae0b2fd5924/Analyze.Sap2000), SAP2000 26.2.0, kip–in–°F. SHA-256 S2K `60ee53086250bd226acf10c5ae7cdefee138ea49da83ef10dcdc4df1a528a013`. Importer được chạy trên mã PR #19 tại `845ffc91e3ec320d515a6c7e9dfb1e2d0283bf3c`, gồm chính sách chặn của PR #21. Các workbook khớp SHA-256 trong con trỏ Git LFS của commit nguồn. Chưa có định danh xác nhận S2K và workbook là cùng lần chạy.

## Mức 1 — Cân bằng tải nguồn với phản lực đáy SAP2000

Với DEAD/LIVE, lấy tự trọng từ `MATERIAL LIST 1 - BY OBJECT TYPE` nhân hệ số pattern, cộng áp lực trọng lực nhân `AreaArea` của từng gán uniform và uniform-to-frame. Đây là sổ cái tải theo diện tích hình học. Diện tích hữu hiệu và phép phân tải thực tế của SAP2000 chưa được kiểm chứng. Với EQX/EQY, cộng từng tải nút tường minh trong S2K trên toàn bộ nút phân tích, gồm các nút lưới không có ID object. Bốn case tĩnh đều dùng pattern cùng tên với hệ số 1. Quy ước so sánh lực là `phản lực dự kiến = -tổng tải` trong hệ toàn cục.

| Case | Thành phần | Phản lực dự kiến (kip) | SAP2000 (kip) | Chênh tuyệt đối (kip) | Chênh tương đối | Kết quả |
|---|---|---:|---:|---:|---:|---|
| DEAD | FZ | 847,095944 | 846,915 | 0,180944 | 0,021365% | Cần giải thích |
| LIVE | FZ | 984,859744 | 984,497 | 0,362744 | 0,036846% | Cần giải thích |
| EQX | FX | −490,246712 | −490,247 | 0,000288 | 0,0000587% | Khớp trong dung sai |
| EQY | FY | −490,246712 | −490,247 | 0,000288 | 0,0000587% | Khớp trong dung sai |

Dùng dung sai tuyệt đối **0,0005 kip**, bằng nửa bước 0,001 kip của các thành phần phản lực chính trong bản xuất. Không cộng dung sai tương đối. Áp cùng ngưỡng tuyệt đối để kiểm các thành phần gần 0, nơi phần trăm do chia cho nhiễu số không có ý nghĩa thực tế. Tám thành phần phụ đều nằm trong ngưỡng. Ngưỡng này dùng để đối chiếu số liệu xuất, không dùng làm ngưỡng nghiệm thu chuyển vị/nội lực. [Kết quả đủ 12 thành phần](../../tests/benchmarks/csi/platform/platform-m2.json)

| Nguồn tải đứng | DEAD (kip) | LIVE (kip) |
|---|---:|---:|
| Tự trọng | 355,272277 | 0 |
| Uniform trên diện, 12 gán mỗi case | 206,798665 | 414,809739 |
| Uniform-to-frame, 62 gán mỗi case | 285,025002 | 570,050005 |

Trên cùng 62 area, các gán uniform-to-frame là tải theo một phương, có áp lực LIVE đúng gấp đôi DEAD và chiếm khoảng 58% tải LIVE trong sổ cái. Sai khác LIVE cũng gần gấp đôi DEAD. Nếu giả định toàn bộ sai khác đến từ nhóm gán này, diện tích hữu hiệu thiếu tương đương khoảng 8,66 ft² theo DEAD và 8,68 ft² theo LIVE. Dùng hai trị số để khoanh vùng khi xuất tải phân xuống thanh. Để kiểm tra sai khác lực đứng, cần đối chiếu tải được SAP2000 phân xuống thanh và diện tích hữu hiệu của các gán tải, đồng thời xác nhận file S2K và bảng kết quả xuất từ cùng mô hình và lần chạy. [CSI — Area Loads Uniform to Frame](https://docs.csiamerica.com/help-files/sap/Menus/Assign/Area_Loads/Area_Loads_Uniform_to_Frame_%28Shell%29.htm)

Với EQX/EQY, đối chiếu thêm mô men phản lực tại điểm tham chiếu của bảng Base Reactions bằng tổng âm của `M + (r - r₀) × F`. Năm trong sáu thành phần nằm trong dung sai đối chiếu **0,0005 kip·in**. EQY MZ tính được **−1.880.011,173781 kip·in**, SAP2000 xuất **−1.880.011,170 kip·in**, chênh **0,003781 kip·in**. Giữ sai khác này để kiểm tra nguồn. Mô men của DEAD/LIVE chưa tái dựng vì chưa xác nhận vị trí hợp lực tự trọng và phân tải thực tế.

## Kiểm kê ca tải và tổ hợp

Bộ chạy lấy danh sách ca từ S2K và xác minh danh sách ở cả bốn bảng kết quả. Nếu tên ca giữa S2K và một bảng kết quả khác nhau, bộ chạy báo lỗi kiểm kê. Mỗi bảng bao phủ năm ca sau, gồm cả 12 mode của MODAL.

| Ca | Phản lực đáy | Chuyển vị nút | Phản lực nút | Nội lực thanh |
|---|---:|---:|---:|---:|
| DEAD, LIVE, EQX, EQY (mỗi ca) | 1 | 4.210 | 310 | 18.310 |
| MODAL (12 mode) | 12 | 50.520 | 3.720 | 219.720 |

Platform bật tổ hợp thép tự động. Cấu hình nguồn liệt kê DEAD/LIVE/EQX/EQY cho Strength và DEAD/LIVE cho Deflection. S2K có 0 tên tổ hợp tường minh và bốn bảng kết quả có 0 hàng theo tổ hợp. Khi đối chiếu tổ hợp cần lấy chính xác loại tổ hợp, tên thành phần và hệ số do SAP2000 dùng, kèm kết quả xuất theo tên tổ hợp. [CSI — Load Combinations](https://docs.csiamerica.com/help-files/sap/Menus/Define/Load_Combination/Load_Combination.htm)

### Các mô hình tham chiếu ngoài Platform

Chạy importer trên ba file thật trong kho, có SHA-256 khớp với fixture. Bảng dưới ghi ca khai báo và tổ hợp đọc được. Các ca có tên nhưng chưa có gán tải sau nhập cần đối chiếu đầu vào trước khi dùng làm benchmark. Hiện ba mẫu này chưa có bảng kết quả CSI độc lập đi kèm trong bộ dữ liệu đã kiểm tra.

| Mẫu | Pattern / case / combo | Các ca ngoài động đất | Điểm cần xác minh |
|---|---:|---|---|
| SAP2000 23.1.0 — 24061 OMF | 53 / 12 / 87 | CDL, SDL, LL, LLR, WX, WY, S, R, H, MODAL | WY có lực nút và tải thanh. WX, EX, S, R, H có tên case nhưng không có gán lực hay tự trọng sau nhập. Có 36 pattern gió/động đất tự động ASCE 7-16 bị chặn. Tổ hợp gồm 85 Linear Add và 2 Envelope. |
| SAP2000 25.3.1 — Roof | 5 / 6 / 18 | CDL, SDL, Lr, Wu, Wd, MODAL | Wu/Wd có 4 gán áp lực mỗi chiều theo trục local 3 trên area tiết diện None. Cần xác minh dấu, đường truyền tải và phản lực trước khi dùng làm benchmark gió. Tổ hợp gồm 16 Linear Add và 2 Envelope. |
| ETABS 23.2.0 — 23217 SMFs | 11 / 12 / 87 | CDL, SDL, LL, Lr, WX, WY, S, R, H, Modal | WX có tải thanh, WY có lực nút. S, R, H có tên case nhưng chưa có gán lực hay tự trọng sau nhập. Importer ở nhánh đã kiểm tra chặn 9 bản ghi tải biến thiên trên thanh. Tổ hợp gồm 83 Linear Add và 4 Envelope. |

Tên case và phân loại pattern là hai trường riêng. Ví dụ `S` có loại nguồn Snow, còn `R` và `H` ở hai mẫu OMF và SMFs có loại Other. Giữ nguyên tên cho tới khi có định nghĩa tải. [Mẫu SAP2000](../../tests/fixtures/csi/sap2000/README.md) · [Mẫu ETABS](../../tests/fixtures/csi/etabs/README.md)

Đợt kiểm chứng tiếp theo dùng OMF cho tự trọng, tĩnh tải bổ sung, hoạt tải sàn/mái và tổ hợp Linear Add/Envelope, và Roof cho áp lực gió lên/xuống. Mỗi mẫu cần xuất định nghĩa case/combo, gán tải, Base Reactions, Joint Displacements, Joint Reactions và Element Forces - Frames theo từng ca và tổ hợp. Cần mẫu có tải khác 0 cho tuyết, mưa/đọng nước nếu áp dụng, tải ngang đất/nước, tải nhiệt, lún/chuyển vị cưỡng bức và tải di động khi các nhóm này nằm trong phạm vi. Các nhóm này hiện chưa có benchmark M2 từ dữ liệu đã kiểm tra. Modal, phổ phản ứng và lịch sử thời gian cần phép kiểm riêng theo mode hoặc bước thời gian.

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
