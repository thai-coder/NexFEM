# NexFEM
NexFEM Designer is an intuitive structural analysis FEA software you can master in minutes. The basic version is free for professional use with unlimited nodes and elements. It features streamlined modeling, clearly organized analysis results, and customizable structural verifications for all materials

## Tài liệu dự án

- [Bản đồ kiến trúc (mở bằng trình duyệt)](docs/architecture-map.html)
- [Lộ trình](docs/ROADMAP.md)
- [Thiết kế giao diện & cây thư mục](docs/ux/ui-architecture.md)
- [Phạm vi tiêu chuẩn thiết kế (TCVN, Eurocode, ACI/AISC)](docs/design-codes.md)
- [API cục bộ và MCP](docs/api-mcp.md)
- [Cài đặt trên máy khách nhiều người dùng](docs/deployment.md)
- [Quyết định kiến trúc (ADR)](docs/adr/)

## Cấu trúc mã nguồn

```
apps/desktop/          Ứng dụng Tauri 2: frontend React (src/) + backend Rust (src-tauri/)
packages/model-core/   Mô hình kết cấu thuần TypeScript: schema, đơn vị, lệnh có Undo/Redo, kiểm tra mô hình
packages/viewer/       Vẽ 2D/3D bằng Three.js (Plan, Elevation, 3D), chọn đối tượng
packages/ui/           Design token (theme sáng/tối) và bộ biểu tượng
crates/fem-core/       Lõi Rust: đọc cùng định dạng mô hình (solver từ Giai đoạn 5)
resources/templates/   Mô hình mẫu dùng chung cho test TS và Rust
tests/e2e/             Kiểm thử giao diện bằng Playwright
```

## Chạy thử

Cần Node 22+, pnpm 10, Rust stable. Trên Windows cần thêm [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (có sẵn trên Windows 11) và Visual Studio Build Tools (C++).

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

Mỗi lần đẩy code, GitHub Actions build bộ cài Windows, cài thử cho toàn máy và chạy thử bằng hai tài khoản; tải bộ cài ở mục **Artifacts** của lần chạy CI. Máy khách không cần cài .NET hay runtime nào khác — xem [docs/deployment.md](docs/deployment.md).

## Phím tắt chính

| Phím | Lệnh |
| --- | --- |
| Ctrl+Z / Ctrl+Y | Hoàn tác / Làm lại |
| F5 | Chạy phân tích (hiện tại: kiểm tra mô hình, solver ở Giai đoạn 5) |
| Ctrl+1 / 2 / 4 | Bố cục 1 / 2 / 4 khung nhìn |
| PgUp / PgDn | Lên / xuống tầng |
| F2 / F4 / F8 | Ẩn hiện Model Explorer / Properties / Console |
| Ctrl+Shift+P | Bảng lệnh |
| Chuột giữa kéo | Pan · Shift + chuột giữa hoặc chuột phải (3D): xoay · Lăn: zoom |
| Kéo trái → phải / phải → trái | Chọn nằm trọn / chọn cắt qua |
