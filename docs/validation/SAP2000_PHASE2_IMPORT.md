# Giai đoạn 2 — Đối chiếu nhập mô hình SAP2000

## Checkpoint

- Ngày 17/11/2026 (UTC+7). Trạng thái: IN_PROGRESS.
- Nguồn mô hình: `main` tại `f2df3ae400910a3a07d693d620133ae0b2fd5924`, `Analyze.Sap2000/Platform 2nd use.s2k`.
- Mã NexFEM cần kiểm tra: nhánh ứng dụng tại `7669db8bb1f6d02e76feb6936627c9ce3518469c`. Báo cáo giai đoạn 1: `c9d295f4b55b61217009d7e71d41bc0856a51f90`. Nhánh báo cáo giai đoạn 2: `codex/sap-phase2-import`.
- Mục tiêu: chạy bộ nhập đúng phiên bản trên file thật, ghi số lượng, chẩn đoán và bằng chứng cho các nhóm đối tượng, tải, liên kết, gán và case; phân biệt không được nhập, gần đúng và chưa kiểm tra. Không khẳng định kết quả tính hay thực hiện giai đoạn 3.
- Bước tiếp: thiết lập môi trường chạy importer độc lập; giữ nguyên các thay đổi đang stage trong worktree khác. Không công khai trường giấy phép hoặc đường dẫn máy trong file gốc.
- CI/nghiệm thu Windows: chưa chạy.
