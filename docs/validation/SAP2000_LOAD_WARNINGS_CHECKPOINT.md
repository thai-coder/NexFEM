# Checkpoint — cảnh báo tải SAP2000

- Ngày 17/11/2026 (UTC+7); trạng thái REVIEW, cần review độc lập và CI.
- Nhánh `codex/sap-critical-load-warnings`; base `d255da082b4adf898cc2ad7a1a6ee2ea07e16fca`; mã ứng dụng baseline `7669db8bb1f6d02e76feb6936627c9ce3518469c`.
- Đã làm: phân loại nhóm bảng tải SAP2000 chưa hỗ trợ và tự động động đất/gió vào lỗi có tên/số dòng, thay vì info; chặn mở file CSI khi có lỗi nhập, cho xem và sao chép báo cáo. Cảnh báo áp dụng khi bảng có dữ liệu; các bảng khác chưa được kiểm kê đầy đủ.
- Mô hình thực SHA-256 `60ee53086250bd226acf10c5ae7cdefee138ea49da83ef10dcdc4df1a528a013`: importer phát hiện lỗi 3 bảng với 2, 7800, 124 dòng. Không tuyên bố đã nhập các tải hay giải đúng.
- Kiểm thử cục bộ: 67 test io-formats, 4 test chính sách/chuỗi i18n desktop, typecheck io-formats/desktop/e2e, build frontend Vite đều đạt. Audit thật chạy được. Build Vite không bao gồm xác nhận WASM.
- Playwright: đã viết test UI nhưng chưa chạy thành công; browser Playwright thiếu, Chromium hệ thống bị sandbox từ chối socket. CI và nghiệm thu Windows chưa chạy.
- Bước tiếp: chạy CI trên PR; review độc lập ảnh hưởng việc chặn mở khi có lỗi cho cả ETABS/SAP2000 và kiểm tra các bảng chưa phân loại; chủ dự án nghiệm thu Windows. Sau đó sửa riêng khả năng nhập tải, tiết diện góc và liên kết bán cứng.
- Không thay đổi solver, không chứng nhận tương đương SAP2000, không khẳng định sai số 1–2%.
