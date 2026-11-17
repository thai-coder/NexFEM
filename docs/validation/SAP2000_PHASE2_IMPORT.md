# Giai đoạn 2 — Đối chiếu nhập mô hình SAP2000

## Checkpoint

- Cập nhật: 17/11/2026 (UTC+7). Trạng thái: REVIEW: đã chạy và đánh giá importer trong phạm vi nêu dưới đây; chưa sửa các vấn đề phát hiện.
- Repo `thai-coder/NexFEM`. Mã importer và solver thuộc nhánh ứng dụng tại `7669db8bb1f6d02e76feb6936627c9ce3518469c`. Báo cáo giai đoạn 1: `codex/sap-phase1-inventory` tại `c9d295f4b55b61217009d7e71d41bc0856a51f90`; nhánh giai đoạn 2: `codex/sap-phase2-import`.
- Nguồn: [`main` tại f2df3ae](https://github.com/thai-coder/NexFEM/tree/f2df3ae400910a3a07d693d620133ae0b2fd5924/Analyze.Sap2000), `Platform 2nd use.s2k`, SHA-256 `60ee53086250bd226acf10c5ae7cdefee138ea49da83ef10dcdc4df1a528a013`. Mô hình ghi SAP2000 26.2.0, Kip/in/F.
- Đã làm: chạy `importS2k` trực tiếp bằng mã tại commit ứng dụng; ghi bảng đếm, chẩn đoán, một số kiểm tra dữ liệu, báo cáo và [JSON tổng hợp](SAP2000_PHASE2_IMPORT.audit.json). Chạy trong Node 24.22.1/Linux, không mở giao diện Windows và không chạy solver.
- Không tuyên bố kết quả 1–2%, không dùng mô hình nhập này làm căn cứ phân tích/thiết kế tương đương; không thay đổi dữ liệu gốc.
- Bước tiếp: review độc lập các phát hiện, đặc biệt việc phân loại bảng tải trọng bị bỏ, sau đó chia việc sửa thành PR có kiểm thử. Chỉ tiến tới so sánh solver khi dữ liệu và giả thiết của case được đối chiếu đã tương đương, và đã xác minh nguồn `.s2k` và Excel cùng lần chạy.
- Mã audit không sửa importer. Kiểm tra thực hiện: so hash file nguồn, chạy audit hai lần và so kết quả, so tọa độ và gối theo bảng nguồn được parser hiện tại đọc; kiểm tra độc lập 24 tải diện bằng script phân tích nguồn riêng. Chưa chạy CI, solver, hoặc nghiệm thu Windows.

## Kết luận

**Không thể dùng kết quả nhập hiện tại để so sánh toàn mô hình với SAP2000 ở mức 1–2%.** Thiếu 40 thanh thép góc; nhiều độ cứng bán cứng bị gần đúng/chưa hỗ trợ; 124 gán tải diện truyền cho frame và 7.800 dòng tải động đất tự động bị bỏ qua; shell chưa có độ cứng FEM tương đương trong bộ giải hiện tại. Các sai khác này ảnh hưởng đầu vào hoặc mô hình, nên không thể gọi kết quả là sai số bộ giải thuần túy.

Trong giao diện `CsiImportDialog.tsx` tại commit được kiểm tra, `canOpen` chỉ yêu cầu đúng định dạng và nhận diện được đơn vị; danh sách `error` không tự vô hiệu nút mở. Các bảng không nhận diện được ghi `section_ignored` mức **info**, trong khi nhóm info mặc định thu gọn. Đây là kết luận từ đọc mã giao diện, **chưa thử thao tác trực tiếp trên Windows**. Chưa xác minh hành vi chặn hoặc cảnh báo khi F5 sau khi mở; không suy diễn từ nút mở rằng đã chạy phân tích thành công.

## 1. Kết quả đếm từ importer

`source → imported` dưới đây là đếm do importer trả về. Có cùng số lượng **không chứng minh** đúng mọi thuộc tính hay kết quả phân tích.

| Nhóm | Nguồn → đã nhập | Ghi chú |
|---|---:|---|
| Vật liệu | 5 → 5 | Có 2 giá trị hệ số Poisson mặc định theo importer; chưa so đủ thuộc tính |
| Tiết diện frame | 17 → 16 | Bỏ tiết diện Angle `L90X90X6` |
| Nút | 3.573 → 3.573 | Đã so tọa độ và gối như mục 2 |
| Thanh object | 2.447 → 2.407 | 40 thanh có tiết diện `L90X90X6` bị bỏ |
| Area object | 77 → 77 | Là object sau nhập, không phải bằng chứng phần tử shell đã được giải |
| Tiết diện area | 1 → 1 | `Deck`, shell-thin, chiều dày nhập khoảng 0,0009144 m; chưa kiểm đủ thuộc tính |
| Load pattern | 4 → 4 | DEAD, LIVE, EQX, EQY; tự trọng lưu 1/0/0/0 |
| Load case | 5 → 5 | Có tên và loại; không đồng nghĩa đã tái tạo tải động đất hoặc phân tích modal |
| Tải `AREA LOADS - UNIFORM` | 24 → 24 | Đã so giá trị sau đổi đơn vị, xem mục 2 |
| Frame loads | 0 → 0 | Chỉ tính hai bảng frame load mà importer theo dõi; **không tính 124 dòng uniform to frame bị bỏ** |
| Joint loads | 0 → 0 | Không tính 7.800 dòng seismic auto-to-joint bị bỏ |
| Combo | 0 → 0 | Không có `COMBINATION DEFINITIONS` trong input; không chứng minh không có auto-design combo trong SAP2000 |

Importer báo 957 thanh nguồn được chia thành 3.813 đoạn; 1.450 thanh được nhập còn lại không bị chia. Vì vậy mô hình NexFEM cuối cùng có **5.263 frame**, khác 2.407 frame object được nhận trước khi chia. Ánh xạ trong report từ frame nguồn đến một ID frame: ví dụ frame `1` → `f-1-1`, **không mô tả đầy đủ toàn chuỗi đoạn**. Không đồng nhất 5.263 với 6.008 frame element trong xuất SAP2000: đây là hai kết quả chia lưới của hai mô hình khác nhau.

## 2. Kiểm tra đối chiếu dữ liệu đã chạy

- **Tọa độ:** 3.573/3.573 nút nguồn có ánh xạ và tọa độ so khớp sau chuyển in → m; sai khác tuyệt đối lớn nhất khoảng `5,0 × 10⁻¹⁰ m`. Script dùng cùng `parseS2k` với importer nên không phải phép kiểm định độc lập cú pháp; cần kiểm tra thêm đối chiếu Excel/độc lập cho các trường hợp khác.
- **Gối:** 310/310 dòng restraint được đối chiếu 6 bậc tự do sau khi xét Active DOF; không thấy mismatch trong phép kiểm này. Không chứng minh toàn bộ điều kiện biên khác đã nhập.
- **Tải diện trực tiếp:** kiểm tra độc lập bằng script Python tách các dòng nguồn, so theo area + pattern và sắp xếp giá trị: 24/24 dòng, sai khác lớn nhất `0 kN/m²` với thứ tự phép tính trong script kiểm tra sau đổi đơn vị. Kiểm tra giá trị không chứng minh cách giải shell tương đương. `AREA LOADS - UNIFORM TO FRAME` là bảng khác, không nằm trong 24 dòng này.
- **Tải tự động:** 124 dòng `AREA LOADS - UNIFORM TO FRAME` gồm 62 DEAD + 62 LIVE không được importer đọc; 7.800 dòng auto seismic tải nút không được đọc. Trong output cả `frameLoads` và `jointLoads` đều rỗng. Có 24 shell loads nhưng không được suy đoán chúng thay thế cho các tải bị bỏ.
- **Cases:** EQX/EQY có mẫu tải và hệ số 1 trong danh sách case, nhưng định nghĩa tải tự động ASCE và tải nút sinh ra đều bị bỏ; không coi sự hiện diện tên case là đã nhập tải động đất. MODAL được tạo dưới dạng case, nhưng `MASS SOURCE` và `CASE - MODAL 1 - GENERAL` bị bỏ; chưa chứng minh chức năng modal hoạt động hay tương đương.

## 3. Các khác biệt và chẩn đoán

Số lần dưới đây là số thông báo theo importer, **không phải số cấu kiện phân biệt**. Một frame có thể có nhiều đầu và nhiều bậc tự do.

| Mức importer | Mã | Số lần | Ý nghĩa và tác động cần kiểm tra |
|---|---|---:|---|
| error | `section_unsupported` | 1 | Tiết diện thép góc `L90X90X6` chưa hỗ trợ |
| error | `frame_section_unavailable` | 40 | 40 frame dùng tiết diện này không được tạo |
| error | `partial_fixity_unsupported` | 3.765 | Các thành phần độ cứng liên kết không thuộc hai ngưỡng xấp xỉ của importer; không được tái hiện chính xác |
| warning | `partial_fixity_as_pinned` | 4.503 | Thành phần bán cứng được xấp xỉ khớp theo ngưỡng code; không xác nhận sai số tác động toàn kết cấu |
| warning | `frame_cardinal_ignored` | 1.238 | Điểm chèn 8 bị bỏ qua; cần kiểm tra sự lệch tâm và ảnh hưởng |
| warning | `section_props_differ` | 7 | Các tiết diện có thanh sử dụng có ít nhất một đặc trưng sai ngưỡng; bảng importer báo J lệch đến +35,58% cho một tiết diện. Đây là sai khác đặc trưng J theo công thức so của code, **không phải sai số nội lực hay chuyển vị** |
| info | `section_ignored` | 49 bảng | Có cả tải diện truyền frame, tải động đất tự động, nguồn khối lượng và thiết lập mesh; 49 là số loại bảng, không phải tổng số dòng bị bỏ |

File JSON đính kèm liệt kê toàn bộ tên và số bản ghi từng bảng `section_ignored`. Một bảng bị bỏ có thể là metadata hoặc dữ liệu có ảnh hưởng lớn: cần phân loại theo nội dung, không coi tất cả cùng mức rủi ro.

Theo tài liệu `docs/csi-import.md` tại cùng nhánh ứng dụng, độ cứng shell tổng quát chưa được triển khai trong giai đoạn này; tải mặt hiện có cách phân phối gần đúng. Do đó area object và shell load có trong model **không chứng minh** có thể tính như shell SAP2000. Chưa chạy solver để đánh giá cách phân phối trên mô hình này.

## 4. Thứ tự xử lý đề xuất sau giai đoạn 2

1. Review chéo, tạo cảnh báo chặn/hiển thị phù hợp cho bảng tải ảnh hưởng phân tích mà importer hiện chỉ báo info; tránh cho người dùng nhầm case không có tải là kết quả hợp lệ. Quyết định hành vi mở mô hình và F5 bằng thiết kế riêng có test, không tự ý kết luận đã có bảo vệ.
2. Hỗ trợ và kiểm chứng tiết diện thép góc `L90X90X6`, điểm chèn và các đặc trưng độ cứng; làm bài nhỏ có dữ liệu SAP và nghiệm giải tích.
3. Xử lý liên kết bán cứng với độ cứng thực thay vì gán khớp/ngàm ngoài phạm vi đã chứng minh, kiểm chứng từng bậc tự do và ảnh hưởng đầu thanh.
4. Thiết kế/kiểm chứng `uniform to frame` theo đúng hướng, lưới và cơ chế phân phối của case mẫu; kiểm tra tổng lực và mô men. Không thay thế một cách âm thầm bằng uniform shell.
5. Làm phần tử shell, chia lưới và hội tụ; sau đó tách riêng modal/mass source và tải động đất. Không trộn quy tắc ETABS vào chế độ SAP2000.
6. Thực hiện phép so sánh 1–2% cho từng case đủ điều kiện, với đúng đơn vị, dấu, điểm lấy, mesh và dung sai tuyệt đối gần 0. Trước đó xác minh các Excel và `.s2k` cùng trạng thái/lần chạy, kiểm tra cảnh báo SAP và tham chiếu độc lập.

## 5. Tái lập

Từ nhánh có mã ứng dụng và phụ thuộc đã cài, lấy nguyên byte `.s2k` từ commit nguồn và kiểm tra SHA-256 ở đầu báo cáo. Không in toàn bộ nội dung file vì file nguồn có dữ liệu môi trường/giấy phép.

```bash
node --experimental-transform-types scripts/validation/sap-import-audit.mjs /path/to/model.s2k /tmp/nexfem-import.json > audit.json
python scripts/validation/sap-check-uniform.py /path/to/model.s2k /tmp/nexfem-import.json
```

JSON tổng hợp không sao chép nội dung thô, đường dẫn gốc hoặc trường license. Tham số thứ hai tùy chọn tạo một JSON mô hình tạm để chạy kiểm tra Python độc lập; file này chứa dữ liệu mô hình nên cần bảo vệ và không đưa lên repo. Bằng chứng JSON lưu tại `docs/validation/SAP2000_PHASE2_IMPORT.audit.json`. Các phép đối chiếu trong script dùng cùng parser S2K, nên không thay thế kiểm tra độc lập cú pháp hay kiểm chứng FEM. Đơn vị được nhận diện từ mô hình; không chạy script với file không tin cậy trong môi trường không phù hợp.
