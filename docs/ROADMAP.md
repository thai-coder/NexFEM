# Lộ trình NexFEM

Cập nhật: 06/11/2026

NexFEM là phần mềm desktop phân tích và thiết kế kết cấu cho **Windows 10/11**, cách thao tác quen thuộc với người dùng ETABS/SAP2000 nhưng có giao diện và định dạng riêng.

Tài liệu liên quan:
- Bản đồ kiến trúc trực quan (sơ đồ tư duy + luồng dữ liệu): [`docs/architecture-map.html`](architecture-map.html)
- Thiết kế giao diện và cây thư mục: [`docs/ux/ui-architecture.md`](ux/ui-architecture.md)
- Phạm vi tiêu chuẩn thiết kế: [`docs/design-codes.md`](design-codes.md)
- API cục bộ và MCP: [`docs/api-mcp.md`](api-mcp.md)
- Các quyết định kiến trúc: [`docs/adr/`](adr/)

## Quyết định đã chốt

| Mục | Lựa chọn | ADR |
| --- | --- | --- |
| Nền tảng | Desktop Windows 10/11 (Tauri 2 + WebView2), bộ cài `.msi`/`.exe` | [0001](adr/0001-tech-stack.md) |
| Giao diện | React 18 + TypeScript + Vite, Dockview, Zustand, Three.js | [0001](adr/0001-tech-stack.md) |
| Lõi tính toán | Rust (crates `fem-*`, `design-codes`) | [0001](adr/0001-tech-stack.md) |
| Liên thông ETABS/SAP2000 | Đọc/ghi file `.e2k`/`.s2k` (không cần cài CSI) + cầu nối CSI OAPI bằng C# .NET 10, chạy trên máy có ETABS/SAP2000 | [0002](adr/0002-csi-interop.md) |
| API & MCP | API cục bộ REST/SSE (`127.0.0.1`, token) + MCP server `nexfem-mcp` + SDK Python/TypeScript, dùng chung command registry với giao diện | [0004](adr/0004-api-mcp.md) |
| Tiêu chuẩn | TCVN, Eurocode, ACI/AISC (+ ASCE 7 cho tải), làm theo từng đợt | [0003](adr/0003-design-codes.md) |
| File dự án | `.nxf` (zip: JSON mô hình + kết quả nhị phân) | — |

## Cách phát triển

- Code viết và kiểm thử được trên Linux (cloud): giao diện chạy bằng Vite trong trình duyệt và kiểm thử bằng Playwright; solver Rust dùng `cargo test`.
- Bộ cài Windows được build trên GitHub Actions (`windows-latest`) mỗi lần đẩy code lên, nên lúc nào cũng tải về chạy thử được.
- Cầu nối .NET 10 build và test phần chuyển đổi dữ liệu trên Linux/CI; phần gọi ETABS/SAP2000 thật được chạy thử trên máy Windows của người dùng.

## Các giai đoạn

Mỗi giai đoạn kết thúc bằng một bản chạy được trên Windows.

### Giai đoạn 0: Nền móng
- Monorepo pnpm + Turborepo + Cargo workspace theo cây thư mục trong `docs/ux/ui-architecture.md`.
- Schema mô hình (JSON Schema) cho joint, frame, shell, grid, story, material, section, load pattern/case/combo; hệ đơn vị.
- CI: lint, test TS, test Rust, `dotnet test`, build bộ cài Windows.

### Giai đoạn 1: Khung giao diện (UI shell) — v0.1-alpha
- Cửa sổ chính: menu, ribbon, Model Explorer, viewport (1/2/4 ô), Properties, Console/Tables, status bar.
- Theme tối/sáng, phím tắt, command palette, tiếng Việt/Anh. Dữ liệu giả.

### Giai đoạn 2: Định nghĩa mô hình
- Command registry có schema cho mọi thao tác (nền cho API/MCP sau này).
- Hộp thoại Grid/Story, Materials (thư viện B15–B60, CB300–CB500, S235–S460, A992…), Frame/Shell Sections, Load patterns/cases/combos.
- Undo/Redo, lưu/mở `.nxf`.

### Giai đoạn 3: View 2D/3D và công cụ vẽ
- Plan/Elevation/3D, chọn (window/crossing), bắt điểm, vẽ Beam/Column/Brace/Slab/Wall, Replicate.

### Giai đoạn 4: Gán (Assign)
- Gối, nhả liên kết, tải thanh/tải sàn, tiết diện; biểu tượng trên view; Check model.

### Giai đoạn 5: Solver v1 — v0.1
- Khung 3D tuyến tính tĩnh (phần tử dầm 12 bậc tự do, offset, release), diaphragm cứng.
- Bộ bài toán mẫu trong `tests/benchmarks` có đáp án (sách, kết quả SAP2000/ETABS).

### Giai đoạn 6: Hiển thị kết quả
- Biến dạng, biểu đồ M/V/N/T, phản lực, drift tầng, Results Table, xuất Excel/CSV.

### Giai đoạn 7: API cục bộ & MCP — v0.2
- API REST `/api/v1` + SSE trong backend Tauri, token, phạm vi quyền, hộp thoại xác nhận lệnh ghi, nhật ký.
- MCP server `nexfem-mcp` (stdio) cho Claude Desktop/Claude Code: tools đọc trước, sau đó tools ghi và chạy phân tích.
- SDK Python/TypeScript sinh từ OpenAPI; thư mục `workflows/` chứa script mẫu.

### Giai đoạn 8: Liên thông ETABS/SAP2000 — v0.2
- Nhập/xuất `.e2k` (ETABS) và `.s2k` (SAP2000).
- Cầu nối OAPI C# .NET 10: lấy mô hình đang mở, đẩy mô hình sang, lấy kết quả về để so sánh; mở ra qua API và MCP.

### Giai đoạn 9: Phân tích mở rộng — v0.3
- Shell (MITC4) và chia lưới sàn/vách, dao động riêng, phổ phản ứng, P-Delta.

### Giai đoạn 10+: Thiết kế theo tiêu chuẩn và trợ lý AI — v0.4 trở đi
- Theo từng đợt trong [`docs/design-codes.md`](design-codes.md): tổ hợp tải tự động → kiểm tra cấu kiện BTCT → thép → động đất → móng.
- Người dùng tự viết phép kiểm tra (custom verifications).
- Panel trợ lý AI trong app (MCP client), endpoint MCP Streamable HTTP, chế độ headless `nexfem-cli`.

## Mục tiêu "giống phiên bản mới nhất"

ETABS/SAP2000 là sản phẩm phát triển nhiều thập kỷ. NexFEM nhắm tới việc **đủ dùng cho nhà khung BTCT và nhà thép thông dụng** trước, sau đó mở rộng dần. NexFEM không sao chép logo, biểu tượng, tên lệnh độc quyền hay định dạng file độc quyền của CSI; chỉ đọc/ghi các file văn bản xuất ra để liên thông.
