# Checkpoint — 6.3 Biểu đồ mô men M2

- **Cập nhật và múi giờ:** 13/11/2026 (UTC+7).
- **Repo / nhiệm vụ / người thực hiện:** `thai-coder/NexFEM` / GĐ6.3 M2 / Codex.
- **Trạng thái khi ghi:** `IN_PROGRESS`. Mã M2 và kiểm thử tập trung đã sẵn sàng. Xem phần Checkpoint trên PR của nhánh để lấy trạng thái CI, HEAD và nghiệm thu mới nhất.
- **Base:** `codex/phase6-3-m3` tại `0d60b853112947a8a7bf4b751be31bd895f469c3` ([PR #6](https://github.com/thai-coder/NexFEM/pull/6)).
- **Nhánh công việc:** `codex/phase6-3-m2`. Mã triển khai và bài kiểm thử nằm trong commit chứa lần cập nhật này.
- **Đã làm:** Thêm Display → Biểu đồ M2. Dùng chung bộ vẽ, case hiện hành, scale Auto/thủ công và bảng station với M3. M2 dương của NexFEM vẽ về +3 địa phương, theo phía chịu kéo. Station đo từ đầu i và giữ vị trí ngoài đoạn cứng.
- **Kiểm thử trên mã triển khai:** Đã qua typecheck, 72 unit test, build desktop/WASM, 24 test Rust của `fem-solver` và 5 bài Playwright trong `deformation.spec.ts`. Công xôn chịu tải ngang khớp công thức giải tích tại 9 station. Bài kiểm thử viewer kiểm tra dầm, cột, thanh nghiêng và đoạn cứng.
- **Đối chiếu SAP2000:** Ba file `.s2k` được kiểm tra có thiết lập output station. Cần bảng nội lực đã tính từ SAP2000 gồm Frame, Output Case, Station và M2, cùng đơn vị và hướng trục địa phương để so sánh trị số. Khi trục địa phương tương ứng, cần quy đổi dấu M2 vì CSI quy ước M2 dương gây nén ở mặt +3. [Quy ước nội lực SAP2000](https://docs.csiamerica.com/help-files/sap/Output/Frame_Element_Internal_Forces_Output_Conventions.htm)
- **Nghiệm thu Windows:** Thử F5, Display → Biểu đồ M2, đổi case và scale, chọn thanh để xem bảng station, chuyển M2 ↔ M3 và nhấn F6. Kiểm tra trên 3D và mặt bằng. M3 vẫn có checklist riêng trong PR #6.
- **Hành động đầu tiên khi tiếp tục:** Mở PR M2, xác minh HEAD và CI. Nếu CI đạt, lấy bộ cài từ run cùng commit để thử theo checklist Windows.
- **Điều kiện hoàn thành nghiệm thu:** Ghi kết quả Windows và đối chiếu nội lực với bảng SAP2000 khi có dữ liệu xuất.
