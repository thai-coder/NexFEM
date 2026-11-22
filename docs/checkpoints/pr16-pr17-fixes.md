---
id: pr16-pr17-fixes
title: PR #16 sửa chia tấm và PR #17 đóng mô hình
status: DONE
owner: Codex
branch: claude/footing-interior-nodes
updated: 2026-11-15
---
## Checkpoint — PR #16 sửa chia tấm và PR #17 đóng mô hình (15/11/2026, UTC+7)

- **Ghi chú khi tách file (21/11/2026):** trạng thái đổi thành `DONE` vì checkpoint [merge-pr16-pr18-pr17](merge-pr16-pr18-pr17.md) ghi PR #16 và #17 đã merge ngày 16/11/2026 và gọi checkpoint này là lịch sử. Nội dung bên dưới giữ nguyên.

- **Trạng thái:** `REVIEW`. Codex nhận lại phần sửa sau review của Claude. Hai PR cùng nhắm nhánh ứng dụng `claude/etab-sap2000-connection-vts58p`; mỗi PR có thể kiểm tra riêng.
- **PR #16:** nhánh `claude/footing-interior-nodes` tại `6730eb3c2a93e713359c5dc10226def756d2758b`, base `3b9e483`. Sửa ba ca trong checkpoint bên dưới, giữ tổng diện tích trước khi quy lò xo, cảnh báo nếu phải quy về góc. Typecheck, toàn bộ unit test và 60 test io-formats đạt trên cây mã của HEAD. Kiểm tra lại fixture bằng WASM: 11 case tĩnh chạy, CDL lún lớn nhất 92,55 mm theo NexFEM, không ca chia tấm phải quy về góc do lỗi. [PR #16](https://github.com/thai-coder/NexFEM/pull/16) · [CI](https://github.com/thai-coder/NexFEM/actions/runs/43724493896)
- **PR #17:** nhánh `codex/close-model` tại `c014755b314a5b9b5e7edbab17789e97320a97ca`, base `3b9e483`. File → Đóng mô hình / Ctrl+W, bảo vệ thay đổi chưa lưu, quay về Trang chủ trong cùng cửa sổ. Typecheck, unit test, build web/WASM và toàn bộ 101 bài Playwright đạt cục bộ. [PR #17](https://github.com/thai-coder/NexFEM/pull/17) · [CI](https://github.com/thai-coder/NexFEM/actions/runs/43724948392)
- **Thay đổi ngoài HEAD:** Không có phần mã cần khôi phục.
- **Tiếp theo:** Xem kết luận CI và bản cài tại từng PR. Đối với PR #16, review chéo phần hình học/đường truyền tải trên HEAD đã sửa trước merge (Codex GPT‑6.1 Terra · High hoặc Claude Opus · High). Đối với PR #17, thử trên Windows thao tác đóng bằng menu và Ctrl+W, gồm lưu vào file .nxf, huỷ và mở lại từ Trang chủ. CI cài/gỡ thử và E2E web không thay cho nghiệm thu thao tác WebView2. Đối chiếu trị số với ETABS vẫn cần bảng xuất độc lập.
