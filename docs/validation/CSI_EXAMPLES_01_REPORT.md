# Kiểm chứng hai ví dụ CSI số 01

Cập nhật 16/11/2026 (UTC+7). Hai mô hình NexFEM dựng lại từ hình và bảng trong bộ PDF tại commit `4f162a7`. Mỗi mô hình có nguồn và tệp kết quả tham chiếu riêng. Phiên bản chạy của các bảng công bố không ghi trong PDF, còn tài liệu được đóng gói lần lượt trong bộ ETABS 23.2.0 và SAP2000 26.2.0.

| Mô hình | Nguồn và phạm vi đối chiếu | Kết quả |
| --- | --- | --- |
| [ExampleEtabs 01](../../tests/benchmarks/csi/published/ExampleEtabs%2001.json) | [ETABS Example 01](https://github.com/thai-coder/NexFEM/blob/4f162a715d4d60ad63b23a85862160bba09d0568/manual/ETABS%2023/Manuals/Verification/Analysis/Example%2001.pdf), Hình 1-1 và Bảng 1-1, PDF tr. 1–3. Hai ca tải đứng, so V2 và M3 tại 5 vị trí trên dầm B1. | **20/20** đạt. Sai số lớn nhất 2,35 × 10⁻⁶ kN cho V2 và 1,29 × 10⁻⁵ kN·m cho M3. |
| [ExampleSAP2000 01](../../tests/benchmarks/csi/published/ExampleSAP2000%2001.json) | [SAP2000 Problem 1-001](https://github.com/thai-coder/NexFEM/blob/4f162a715d4d60ad63b23a85862160bba09d0568/manual/SAP2000%2026/Manuals/Verification/Analysis/Frames/Problem%201-001.pdf), PDF tr. 1–3. Bảy ca tải trên khung ba thanh, so chuyển vị nút 2 hoặc 3. | **7/7** đạt. Sai số lớn nhất 1,06 × 10⁻⁷ m, ở ca 6. |

## ExampleEtabs 01

- Khung phẳng XZ, hai nhịp 18 ft, cột cao 10 ft. Mô đun đàn hồi 3.000 ksi. Dầm 12 × 30 in, cột 12 × 24 in. Nhả M3 tại hai đầu dầm ngoài và dùng liên kết chân cột giữa theo Hình 1-1. Ca I dùng tải tập trung tại các nút mái và giữa nhịp, ca II dùng tải đều 10 kip/ft.
- PDF nêu bỏ biến dạng cắt và dọc trục. Mô hình dùng Euler–Bernoulli và nhân diện tích chịu lực dọc trục lên `10⁶` để xấp xỉ thanh không đổi chiều dài, giữ nguyên đặc trưng uốn. Hệ số này là cách mô hình hóa trong NexFEM, vì PDF không công bố diện tích tính toán mà ETABS nhận khi chạy ví dụ.
- Đối chiếu station từ đầu I của B1 tại 0, ¼, ½, ¾ và 1 nhịp, theo hình và bảng của ETABS. V2 ngay tại điểm đặt lực giữa nhịp ca I lấy về phía J. Dung sai tuyệt đối bằng nửa bước hiển thị trong PDF, tương ứng 0,005 kip hoặc 0,005 kip·in theo chỉ số.

## ExampleSAP2000 01

- Khung phẳng XZ với ba thanh và bốn nút. Gối khớp tại nút 1, con lăn theo tường đứng tại nút 3. Giữ `I = 1.728 in⁴`, áp hệ số nhân diện tích `1.000` theo PDF và bỏ biến dạng cắt.
- Ca 1 gán trực tiếp trọng lượng đường 0,15 kip/ft để diện tích tính độ cứng nhân `1.000` không làm tăng trọng lượng. Ca 4 dùng tải 2 kip/ft trên chiều dài chiếu ngang 8 ft của thanh nghiêng dài 10 ft. Giá trị áp trên thanh là 1,6 kip/ft theo hướng trọng lực.
- Ca 6 quy tải hình thang và tam giác thành tải nút nhất quán với hàm dạng dầm Euler–Bernoulli. Phần này kiểm tra chuyển vị trên tải nút tương đương. Luồng gán hoặc nhập tải phân bố biến thiên và nội lực dọc thanh trong ca 6 chưa được bao phủ.
- Các chuyển vị dùng dung sai tuyệt đối 0,000005 in, bằng nửa bước làm tròn của bảng công bố.

| Ca tải | Chỉ số | SAP2000 trong PDF (in) | NexFEM (in) |
| --- | --- | ---: | ---: |
| 1 | Uz nút 3 | −0,02639 | −0,02638971 |
| 2 | Uz nút 3 | +0,06296 | +0,06295961 |
| 3 | Uz nút 3 | +0,06296 | +0,06295961 |
| 4 | Uz nút 3 | −0,29630 | −0,29630185 |
| 5 | Ux nút 2 | +0,31250 | +0,31250185 |
| 6 | Ux nút 2 | +0,11556 | +0,11555583 |
| 7 | Ux nút 2 | +0,00651 | +0,00651137 |

## Chạy lại

Mở hai tệp `.json` qua **File → Mở**, chạy F5 rồi chọn ca tải muốn xem trong NexFEM. Chạy benchmark tự động từ thư mục gốc với Cargo và pnpm có sẵn.

```bash
pnpm --filter @nexfem/io-formats exec vitest run test/csi-benchmarks.test.ts
```

Bộ test đọc mô hình qua đường mở dự án, chạy kiểm tra mô hình trước F5, gọi solver Rust và đối chiếu theo từng chỉ số. M2 vẫn cần chạy lại mô hình gốc ETABS/SAP2000 và thu bản xuất có phiên bản, mô hình và bảng kết quả kèm theo để kiểm chứng đường nhập tương ứng. Hai mẫu này xác nhận các chỉ số được liệt kê trong bảng công bố.
