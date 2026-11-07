# Đánh số phiên bản

Cập nhật: 07/11/2026

## Quy tắc

- Phiên bản có dạng **`MAJOR.MINOR.BUILD`**, ví dụ `0.1.16`.
- `MAJOR.MINOR` ghi trong file [`VERSION`](../VERSION) ở gốc repo (hiện `0.1`); đổi tay khi có mốc lớn.
- `BUILD` là **số lần chạy CI** (`github.run_number`): **mỗi lần đẩy code lên nhánh phát triển là một phiên bản mới**, luôn tăng dần, không trùng.
- Ở Windows, phiên bản file hiển thị 4 số: `0.1.16.0`.
- Bản chạy `pnpm dev`/`cargo build` trên máy lập trình mang phiên bản `0.1.0` (chưa qua CI).

## Phiên bản xuất hiện ở đâu

| Nơi | Giá trị |
| --- | --- |
| Tên file cài | `NexFEM_0.1.16_x64-setup.exe`, `NexFEM_0.1.16_x64_en-US.msi` |
| Properties → Details của file cài | Company `lkat.vn`, File description `NexFEM - Structural Analysis Application`, File version `0.1.16`, Product version `0.1.16` |
| Properties → Details của `NexFEM.exe` đã cài | Company `lkat.vn`, File description `NexFEM`, File version `0.1.16.0` |
| Biểu tượng của file cài và `NexFEM.exe` | Logo chữ N |
| Add/Remove Programs | Publisher `lkat.vn`, Version `0.1.16` |
| Help → About trong app | `NexFEM 0.1.16 (<mã commit>) · … © lkat.vn` |
| GitHub Releases | tag `v0.1.16`, bản mới nhất được đánh dấu "Latest" |

## Cách hoạt động

- CI chạy `node scripts/set-version.mjs --build <số lần chạy>` trước khi build: ghi phiên bản vào `apps/desktop/src-tauri/tauri.conf.json` và `Cargo.toml` (workspace). Thay đổi này chỉ nằm trong máy CI, **không commit** về repo.
- Frontend lấy phiên bản và mã commit lúc build (`vite.config.ts`), nên "Giới thiệu" luôn khớp với file cài.
- File cài NSIS dùng mẫu riêng [`installer/installer.nsi`](../apps/desktop/src-tauri/installer/installer.nsi) (copy từ mẫu mặc định của Tauri, chỉ thêm `CompanyName` và `FileDescription`) vì mẫu mặc định không ghi công ty.
- Sau khi cài thử trên Windows, CI **kiểm tra lại** công ty, mô tả, phiên bản và sự có mặt của biểu tượng trên file cài và `NexFEM.exe`; sai là CI đỏ (`scripts/ci/test-windows-install.ps1`).
- Sau khi CI đạt, job "Phát hành bộ cài thử" tạo bản phát hành `v<phiên bản>` kèm file `.exe` và `.msi`, và cập nhật nhánh `installer`.

## Lưu ý

- Số `BUILD` tăng theo lần chạy workflow nên có thể có "lỗ" khi một lần chạy bị huỷ hoặc đỏ: lần đẩy đó vẫn tiêu một số, nhưng không có bản phát hành đi kèm.
- Đẩy nhiều commit trong một lần vẫn chỉ ra một phiên bản.
- Bản phát hành cũ `latest-build` được thay bằng bản có số; dùng `https://github.com/thai-coder/NexFEM/releases/latest`.
