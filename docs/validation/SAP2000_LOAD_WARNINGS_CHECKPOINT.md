# Checkpoint — cảnh báo tải SAP2000

- Ngày 17/11/2026 (UTC+7); trạng thái REVIEW, cần review độc lập và CI.
- Nhánh `codex/sap-critical-load-warnings`; base `d255da082b4adf898cc2ad7a1a6ee2ea07e16fca`; mã ứng dụng baseline `7669db8bb1f6d02e76feb6936627c9ce3518469c`.
- Đã làm: phân loại nhóm bảng tải SAP2000 chưa hỗ trợ và tự động động đất/gió vào lỗi có tên/số dòng, thay vì info; chặn mở file CSI khi có lỗi nhập, cho xem và sao chép báo cáo. Cảnh báo áp dụng khi bảng có dữ liệu; các bảng khác chưa được kiểm kê đầy đủ.
- Mô hình thực SHA-256 `60ee53086250bd226acf10c5ae7cdefee138ea49da83ef10dcdc4df1a528a013`: importer phát hiện lỗi 3 bảng với 2, 7800, 124 dòng. Không tuyên bố đã nhập các tải hay giải đúng.
- Kiểm thử cục bộ: 67 test io-formats, 4 test chính sách/chuỗi i18n desktop, typecheck io-formats/desktop/e2e, build frontend Vite đều đạt. Audit thật chạy được. Build Vite không bao gồm xác nhận WASM.
- Playwright: đã viết test UI nhưng chưa chạy thành công; browser Playwright thiếu, Chromium hệ thống bị sandbox từ chối socket. CI và nghiệm thu Windows chưa chạy.
- Bước tiếp: chạy CI trên PR; review độc lập ảnh hưởng việc chặn mở khi có lỗi cho cả ETABS/SAP2000 và kiểm tra các bảng chưa phân loại; chủ dự án nghiệm thu Windows. Sau đó sửa riêng khả năng nhập tải, tiết diện góc và liên kết bán cứng.
- Không thay đổi solver, không chứng nhận tương đương SAP2000, không khẳng định sai số 1–2%.

## Cập nhật review — 17/11/2026 (UTC+7)

- CI [run 180](https://github.com/thai-coder/NexFEM/actions/runs/44011685326) đạt tại HEAD cũ `b103904`: Rust, typecheck/test, 103 Playwright (gồm test chặn mở), build và test bộ cài Windows tự động. Không thay thế nghiệm thu thực tế.
- Phát hiện trong review: mẫu `24061_OMF.s2k` có 36 `AutoLoad="ASCE 7-16"` nhưng không có bảng auto tương ứng; HEAD cũ không báo lỗi. Trong đó 24 dòng `LoadPat = ...` bị parser bỏ tên vì có khoảng trắng quanh dấu bằng. Đã xử lý bằng cách báo lỗi mọi AutoLoad khác None ngay ở pattern và chấp nhận khoảng trắng quanh dấu bằng; chính sách thận trọng chặn cả pattern chưa được dùng. Không khẳng định dữ liệu tải tự động đã được nhập.
- Ở bản sửa mới: 68 test io-formats, 4 test chính sách/i18n, typecheck io-formats/desktop/e2e và build Vite đạt cục bộ. Mô hình 26.2.0 được kiểm kê có 2 AutoLoad và 3 bảng tải chưa hỗ trợ được báo lỗi. Test UI mới cần CI; CI của HEAD cũ không chứng minh HEAD mới đạt.
- Hành động tiếp: chờ CI HEAD mới, review độc lập và nghiệm thu Windows. Không merge khi chưa có review phù hợp vùng nguy cơ cao.

## Cập nhật 17/11/2026 — danh sách cho phép và cờ chặn

- Phạm vi: yêu cầu tiếp theo của chủ dự án, gồm lỗi tham chiếu thiếu, danh sách cho phép fail-closed, cờ chặn tại io-formats và cùng quy tắc kiểm tra cho ETABS.
- `case_item_missing` và `combo_item_missing` là lỗi cho cả hai định dạng; ETABS cũng báo lỗi tham chiếu thiếu hệ số. Từng bộ nhập chỉ bỏ qua các phần metadata được ghi rõ trong danh sách cho phép; phần có dữ liệu không được nhận diện thành lỗi `section_unverified`. Thuộc tính load pattern ETABS ngoài tập đã kiểm tra cũng báo lỗi.
- `report.blocked` được tạo ở io-formats cho mọi đường trả về; giao diện tiêu thụ cờ này. Không phải cơ chế cứng trong schema/bộ giải: consumer tự ý bỏ qua cờ vẫn có thể dùng `model` và phải được sửa riêng nếu tồn tại.
- Hệ quả có chủ đích: các file thật ETABS mẫu và SAP Roof đang bị chặn vì có các phần chưa kiểm chứng; không xóa/bỏ dữ liệu nguồn, cần kiểm chứng từng bảng để hỗ trợ. Không kết luận file không an toàn hay nguồn sai.
- Kiểm tra tại cây đang chuẩn bị commit: 76 test io-formats, 11 test desktop, typecheck io-formats/desktop/e2e và build Vite đạt. Test Playwright đã cập nhật, chưa chạy cục bộ do Chromium bị sandbox chặn socket. Chờ CI và review độc lập; không tuyên bố tương đương hoặc 1–2%.

## Sửa theo review độc lập — 21/11/2026

- Nhánh `claude/festive-ritchie-e8hzpu` (gộp `e0799a8` của PR #21, rồi sửa trên đó).
- 1. Tải hình thang/một đoạn (`.s2k` `FRAME LOADS - DISTRIBUTED`, `.e2k` `LINELOAD TRAPF`): lỗi `line_load_not_uniform`, không nhập, chặn mở. Trước đây đổi thành tải đều cả nhịp (giữ hợp lực, sai vị trí; ví dụ tính tay mômen ngàm 135 → 90 kN·m). `DistType=AbsDist` chỉ nhận khi khớp `RelDist`; `SelfWtMult`/`SELFWEIGHT` âm hoặc lỗi: chặn. Khoá lạ trên tải ETABS (`CSYS`…) và mọi `POINTASSIGN` khác `RESTRAINT`, khoá `LINEASSIGN` lạ: lỗi.
- 2. Parser `.s2k`: trường rỗng không nuốt trường kế tiếp (đã kiểm chứng ngược: regex cũ làm hỏng 2 test).
- 3. Danh sách cho phép thu hẹp chặn về dữ liệu ảnh hưởng phân tích (xem `docs/csi-import.md`, mục "Danh sách cho phép"). File mẫu còn bị chặn: Roof (2 bảng chia lưới/ràng buộc mép sàn), 24061 (36 AutoLoad), ETABS (9 tải TRAPF một đoạn).
- 4. Khôi phục e2e mở + F5 trên ETABS và SAP2000 thật bằng biến thể dẫn xuất lúc chạy (không tương đương mô hình gốc).
- 5. `openCsiImport` kiểm tra lại chính sách trước khi đưa mô hình vào phân tích.
- Kiểm thử cục bộ: io-formats 102/102, desktop 13/13, typecheck io-formats/desktop, build desktop (có WASM), Playwright 105/105.
- Chưa làm: nghiệm thu Windows; đối chiếu kết quả FEM với SAP2000/ETABS; không khẳng định sai số 1–2%. Vẫn là cảnh báo (có thể đổi kết quả, cần quyết định riêng): bỏ hệ số hiệu chỉnh độ cứng, điều kiện đầu khác Zero, liên kết nửa cứng coi như ngàm/khớp, điểm chèn, đoạn lệch đầu thanh.
