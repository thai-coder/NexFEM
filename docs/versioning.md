# Đánh số phiên bản

Cập nhật: 14/11/2026

## Quy tắc

Phiên bản có dạng **`X.Y.Z`** (quy tắc do chủ dự án chốt ngày 14/11/2026):

| Phần | Ý nghĩa | Công thức | Ví dụ |
| --- | --- | --- | --- |
| `X` | năm | `năm − 2026` | 2026 → 0, 2027 → 1, 2028 → 2 |
| `Y` | tháng, **đếm liên tục** từ tháng 10/2026, không quay về 1 khi sang năm | `12 × (năm − 2026) + tháng − 10` | 11/2026 → 1, 12/2026 → 2, 01/2027 → 3, 10/2027 → 12 |
| `Z` | số lần cải tiến = số lần chạy CI (`github.run_number`) | tăng mãi, **không đặt lại** khi đổi tháng hay năm | 153 → 154 → 155 … |

- Hôm nay (11/2026) là `0.1.Z`; bản `0.1.153` là bản cuối đã theo đúng quy tắc, các bản sau là `0.1.154`, … cho đến hết tháng 11. Sang 12/2026 thì `0.2.Z` với `Z` tiếp tục tăng (không về 0). Sang 01/2027 thì `1.3.Z`.
- **Mỗi lần đẩy code lên nhánh phát triển là một phiên bản mới**, luôn tăng dần, không trùng.
- `X.Y` được **tính tự động** từ ngày chạy CI (UTC) trong [`scripts/version-rule.mjs`](../scripts/version-rule.mjs); không còn file `VERSION`, không phải đổi tay đầu tháng. Test các mốc: `scripts/version-rule.test.mjs` (chạy trong CI).
- Giới hạn kỹ thuật của MSI: phần thứ nhất ≤ 255, thứ hai ≤ 255, thứ ba ≤ 65535.
  - `Z` dùng được đến 65535 lần chạy CI (hiện khoảng 155). Khi `Z` vượt 60000, CI hiện cảnh báo để kịp chốt cách xử lý. Đề xuất lúc đó: đặt lại `Z` về 0 vào đầu một tháng mới; phiên bản vẫn tăng dần vì `X.Y` đã đổi.
  - `Y` chạm 255 vào tháng 01/2048 (`22.255.Z`); từ 02/2048 script báo lỗi và cần chốt quy tắc mới.
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

- CI chạy `node scripts/set-version.mjs --build <số lần chạy>` trước khi build (thử ngày khác: thêm `--date 2027-01-15`): ghi phiên bản vào `apps/desktop/src-tauri/tauri.conf.json` và `Cargo.toml` (workspace). Thay đổi này chỉ nằm trong máy CI, **không commit** về repo.
- Frontend lấy phiên bản và mã commit lúc build (`vite.config.ts`), nên "Giới thiệu" luôn khớp với file cài.
- File cài NSIS dùng mẫu riêng [`installer/installer.nsi`](../apps/desktop/src-tauri/installer/installer.nsi) (copy từ mẫu mặc định của Tauri, chỉ thêm `CompanyName` và `FileDescription`) vì mẫu mặc định không ghi công ty.
- Sau khi cài thử trên Windows, CI **kiểm tra lại** công ty, mô tả, phiên bản và sự có mặt của biểu tượng trên file cài và `NexFEM.exe`; sai là CI đỏ (`scripts/ci/test-windows-install.ps1`).
- Sau khi CI đạt, job "Phát hành bộ cài thử" tạo bản phát hành `v<phiên bản>` kèm file `.exe` và `.msi`, và cập nhật nhánh `installer`.

## Lưu ý

- Số `BUILD` tăng theo lần chạy workflow nên có thể có "lỗ" khi một lần chạy bị huỷ hoặc đỏ: lần đẩy đó vẫn tiêu một số, nhưng không có bản phát hành đi kèm.
- Đẩy nhiều commit trong một lần vẫn chỉ ra một phiên bản.
- Bản phát hành cũ `latest-build` được thay bằng bản có số; dùng `https://github.com/thai-coder/NexFEM/releases/latest`.
