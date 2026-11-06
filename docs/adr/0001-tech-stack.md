# ADR 0001: Bộ công nghệ và nền tảng

- Trạng thái: Đã chấp nhận
- Ngày: 06/11/2026

## Bối cảnh

NexFEM là phần mềm desktop phân tích kết cấu, người dùng chính làm việc trên Windows. Thiết kế giao diện ở `docs/ux/ui-architecture.md` đề xuất Tauri + React + Rust, phương án thay thế là PySide6 + VTK + NumPy.

## Quyết định

- **Nền tảng mục tiêu:** Windows 10/11 x64. Bộ cài `.msi`/NSIS `.exe` từ Tauri 2, dùng WebView2 có sẵn trong Windows. macOS/Linux không phải mục tiêu chính nhưng không bị chặn.
- **Giao diện:** React 18 + TypeScript + Vite, Dockview, Zustand + Immer, react-three-fiber/Three.js, AG Grid Community hoặc TanStack Table.
- **Lõi tính toán:** Rust (faer/nalgebra, sparse solver), gọi trực tiếp từ backend Tauri; sau này biên dịch WASM nếu có bản web.
- **Monorepo:** pnpm workspace + Turborepo cho TS, Cargo workspace cho Rust.
- **CI:** GitHub Actions; job `windows-latest` build bộ cài cho mỗi lần đẩy code.

## Hệ quả

- Giao diện chạy được trong trình duyệt khi phát triển, nên kiểm thử tự động bằng Playwright được trên Linux.
- Solver Rust nhanh và an toàn bộ nhớ, nhưng viết chậm hơn Python; bù lại bằng bộ bài toán mẫu chặt chẽ.
- Script tự động hóa của người dùng viết bằng Python (xem ADR 0002) giao tiếp với NexFEM qua file `.nxf` hoặc API cục bộ, không nhúng Python vào app.
