# NexFEM
NexFEM Designer is an intuitive structural analysis FEA software you can master in minutes. The basic version is free for professional use with unlimited nodes and elements. It features streamlined modeling, clearly organized analysis results, and customizable structural verifications for all materials

## Tài liệu dự án

- [Bản đồ kiến trúc (mở bằng trình duyệt)](docs/architecture-map.html)
- [Lộ trình](docs/ROADMAP.md)
- [Thiết kế giao diện & cây thư mục](docs/ux/ui-architecture.md)
- [Phạm vi tiêu chuẩn thiết kế (TCVN, Eurocode, ACI/AISC)](docs/design-codes.md)
- [API cục bộ và MCP](docs/api-mcp.md)
- [Cài đặt trên máy khách nhiều người dùng](docs/deployment.md)
- [Đánh số phiên bản](docs/versioning.md)
- [Quyết định kiến trúc (ADR)](docs/adr/)

## Cấu trúc mã nguồn

```
apps/desktop/          Ứng dụng Tauri 2: frontend React (src/) + backend Rust (src-tauri/)
packages/model-core/   Mô hình kết cấu thuần TypeScript: schema, đơn vị, lệnh có Undo/Redo, kiểm tra mô hình
packages/viewer/       Vẽ 2D/3D bằng Three.js (Plan, Elevation, 3D), chọn đối tượng
packages/ui/           Design token (theme sáng/tối) và bộ biểu tượng
crates/fem-core/       Lõi Rust: kiểu dữ liệu mô hình dùng chung với TypeScript
crates/fem-solver/     Bộ giải tĩnh tuyến tính khung 3D + bài toán mẫu có đáp án
crates/fem-wasm/       Bộ giải biên dịch sang WebAssembly cho giao diện
resources/templates/   Mô hình mẫu dùng chung cho test TS và Rust
tests/e2e/             Kiểm thử giao diện bằng Playwright
```

## Chạy thử

Cần Node 22+, pnpm 10, Rust stable và target WebAssembly (`rustup target add wasm32-unknown-unknown`). Trên Windows cần thêm [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (có sẵn trên Windows 11) và Visual Studio Build Tools (C++).

```bash
pnpm install
pnpm dev            # chạy giao diện trong trình duyệt: http://localhost:1420
pnpm tauri dev      # chạy ứng dụng desktop
pnpm tauri build    # tạo bộ cài .msi / .exe (trên Windows)
```

Kiểm tra:

```bash
pnpm typecheck && pnpm test     # TypeScript + vitest
pnpm build && pnpm e2e          # Playwright (lần đầu: pnpm --filter @nexfem/e2e exec playwright install chromium)
cargo test --workspace          # Rust
pnpm gen                        # sinh lại JSON Schema và mô hình mẫu khi đổi schema
```

Mỗi lần đẩy code là một phiên bản mới (`0.1.<số lần chạy CI>`, nhà phát hành lkat.vn); GitHub Actions build bộ cài Windows, cài thử cho toàn máy và chạy thử bằng hai tài khoản; tải bộ cài ở mục **Artifacts** của lần chạy CI. Máy khách không cần cài .NET hay runtime nào khác — xem [docs/deployment.md](docs/deployment.md).

## Phím tắt chính

| Phím | Lệnh |
| --- | --- |
| Ctrl+Z / Ctrl+Y | Hoàn tác / Làm lại |
| F5 / F6 | Chạy phân tích (khoá mô hình) / mở khoá |
| Ctrl+1 / 2 / 4 | Bố cục 1 / 2 / 4 khung nhìn |
| PgUp / PgDn | Lên / xuống tầng |
| F2 / F4 / F8 | Ẩn hiện Model Explorer / Properties / Console |
| Ctrl+Shift+P | Bảng lệnh |
| Chuột giữa kéo | Pan · Lăn: zoom |
| Chuột phải kéo (3D) | Xoay quanh điểm dưới con trỏ (hoặc Shift + chuột giữa) |
| Kéo trái → phải / phải → trái | Chọn nằm trọn / chọn cắt qua |
| J / B / C / R / S / W | Vẽ nút / dầm / cột / giằng / sàn / vách |
| Enter · Backspace · Esc | Kết thúc (đóng sàn) · bỏ điểm vừa bấm · huỷ / về công cụ Chọn |
| Shift (khi vẽ) | Khoá phương ngang/dọc |
| Ctrl+R | Nhân bản đối tượng đang chọn |
