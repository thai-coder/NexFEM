---
id: review-pr16-footing-split
title: Review PR #16: chia tấm tại nút để quy lò xo nền
status: DONE
owner: Codex
branch: claude/footing-interior-nodes
pr: 16
updated: 2026-11-15
---
## Checkpoint — Review PR #16: chia tấm tại nút để quy lò xo nền (15/11/2026, UTC+7)

- **Ghi chú khi tách file (21/11/2026):** trạng thái đổi thành `DONE` vì checkpoint [merge-pr16-pr18-pr17](merge-pr16-pr18-pr17.md) ghi PR #16 và #17 đã merge ngày 16/11/2026 và gọi checkpoint này là lịch sử. Nội dung bên dưới giữ nguyên.

- **Trạng thái:** `REVIEW`, Codex đã kiểm tra và yêu cầu sửa trước khi merge. [PR #16](https://github.com/thai-coder/NexFEM/pull/16)
- **Base / HEAD:** `claude/etab-sap2000-connection-vts58p` tại `3b9e48348dc3f9b5ba65faacbcc291aa5192d821` / `claude/footing-interior-nodes` tại `a7640a72d2be8802c995f285d52735ea2a5e415a`. Commit dùng cho CI có cùng cây mã với HEAD; Rust, TypeScript, Playwright và kiểm thử bộ cài Windows đều đạt. [CI](https://github.com/thai-coder/NexFEM/actions/runs/43699113404)
- **Hai lỗi tái hiện trên HEAD:** (1) Tấm chữ L với góc `[(0,0),(2,0),(2,1),(1,1),(1,2),(0,2)]`, nút `(0.5,0.5)` và dung sai `1e-6 m` cho tổng diện tích phân bổ `4 m²` thay vì `3 m²`. Bước cắt tai cho phép đường chéo đi qua đỉnh lõm. (2) Tấm `4 × 2 m`, nút `(2,-0.0009)` và dung sai `0.001 m` cho nút ngoài tấm nhận `2.6678667 m²` và làm tổng tăng từ `8` lên `8.0036 m²`. Đo trên `meshedNodeAreas` của commit trên bằng Node.
- **Ca cần bổ sung:** Đảo thứ tự hai ứng viên `(2,0)` và `(1,0.5)` trên tấm `4 × 2 m` làm phần diện tích nút mép đổi từ `2.3333` sang `0.3333 m²` dù tổng vẫn là `8 m²`. Cần phân bổ nhất quán khi thứ tự bản ghi đổi.
- **Hành động đầu tiên:** Claude Code (Opus, High) thêm các ca tái hiện vào `packages/io-formats/test/locate.test.ts`, sửa nhận diện nút sát mép và tam giác hoá trong PR #16, rồi giữ test mô hình thật C3/nút 57 và chạy CI. Codex kiểm tra lại trên SHA mới trước khi chủ dự án merge.
- **Còn lại:** Nghiệm thu Windows và đối chiếu trị số với ETABS. Review chỉ thay đổi checkpoint; mã PR ở nguyên commit được kiểm tra.
