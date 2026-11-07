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
| Giao diện | React 19 + TypeScript + Vite, Dockview, Zustand, Three.js | [0001](adr/0001-tech-stack.md) |
| Lõi tính toán | Rust (crates `fem-*`, `design-codes`) | [0001](adr/0001-tech-stack.md) |
| Liên thông ETABS/SAP2000 | Đọc/ghi file `.e2k`/`.s2k` (không cần cài CSI) + cầu nối CSI OAPI bằng C# .NET 10, chạy trên máy có ETABS/SAP2000 | [0002](adr/0002-csi-interop.md) |
| API & MCP | API cục bộ REST/SSE (`127.0.0.1`, token) + MCP server `nexfem-mcp` + SDK Python/TypeScript, dùng chung command registry với giao diện | [0004](adr/0004-api-mcp.md) |
| Tiêu chuẩn | TCVN, Eurocode, ACI/AISC (+ ASCE 7 cho tải), làm theo từng đợt | [0003](adr/0003-design-codes.md) |
| File dự án | `.nxf` (zip: JSON mô hình + kết quả nhị phân) | — |
| Triển khai | Cài cho toàn máy (MSI/NSIS), WebView2 gói sẵn, không cần .NET; dữ liệu riêng từng tài khoản | [0005](adr/0005-deployment.md) |

## Cách phát triển

- Code viết và kiểm thử được trên Linux (cloud): giao diện chạy bằng Vite trong trình duyệt và kiểm thử bằng Playwright; solver Rust dùng `cargo test`.
- Bộ cài Windows được build trên GitHub Actions (`windows-latest`) mỗi lần đẩy code lên, nên lúc nào cũng tải về chạy thử được.
- Cầu nối .NET 10 build và test phần chuyển đổi dữ liệu trên Linux/CI; phần gọi ETABS/SAP2000 thật được chạy thử trên máy Windows của người dùng.

## Các giai đoạn

Mỗi giai đoạn kết thúc bằng một bản chạy được trên Windows.

### Giai đoạn 0: Nền móng — ✅ xong (06/11/2026)
- Monorepo pnpm + Turborepo + Cargo workspace theo cây thư mục trong `docs/ux/ui-architecture.md`.
- Schema mô hình (zod → JSON Schema `packages/model-core/schema/model.schema.json`) cho joint, frame, shell, grid, story, material, section, load pattern/case/combo; hệ đơn vị. Rust (`crates/fem-core`) đọc cùng định dạng, kiểm tra bằng mô hình mẫu chung `resources/templates/sample-frame.json`.
- Command registry có schema và Undo/Redo (immer patches) — làm sớm từ Giai đoạn 2 vì giao diện cần ngay.
- CI: kiểm tra kiểu TS, vitest, Playwright e2e, `cargo fmt`/`clippy`/`test`, build bộ cài Windows. (`dotnet test` thêm khi có cầu nối .NET ở Giai đoạn 8.)

### Giai đoạn 1: Khung giao diện (UI shell) — ✅ xong, v0.1-alpha
- Cửa sổ chính: menu, ribbon, Model Explorer, viewport (1/2/4 ô), Properties, Console/Messages/Bảng/Analysis Log, status bar.
- Theme tối/sáng, phím tắt, command palette, tiếng Việt/Anh. Dữ liệu mẫu: khung BTCT 3×2 nhịp, 5 tầng.
- Làm thêm sớm: viewer 2D/3D có chọn bằng click và kéo khung (window/crossing), sửa thuộc tính có Undo, Console gõ lệnh (`beam`, `column`, `select`, `cmd`), Check model.
- Chưa làm (để đúng giai đoạn): hộp thoại Define, vẽ bằng chuột, Assign, lưu/mở file — các mục này hiện nhãn "GĐ n" trong menu.

### Giai đoạn 2: Định nghĩa mô hình — ✅ xong (07/11/2026)
- Hộp thoại Mô hình mới: mẫu Khung BTCT / Chỉ lưới trục / Trống, nhập nhịp kiểu `3@6, 7.2`, chọn mác bê tông, kích thước cột/dầm/sàn, đơn vị; danh sách file mở gần đây (bản desktop).
- Hộp thoại Lưới trục & Tầng: sửa toạ độ hoặc khoảng cách trục, thêm/xoá trục, nút dính trục tự dời theo; bảng tầng với cao tầng, cao độ, tầng chuẩn/giống tầng; hình xem trước.
- Hộp thoại Vật liệu (thêm từ thư viện B15–B60, CB300–CB500, S235–S460), Tiết diện thanh (chữ nhật, tròn, I, hộp, ống; đặc trưng hình học và hình vẽ đúng tỉ lệ), Tiết diện sàn/vách, Tải trọng (mẫu tải, trường hợp tải, tổ hợp).
- Mỗi lần OK/Áp dụng là một bước Undo; không xoá được định nghĩa đang dùng; trùng tên hoặc thiếu tham chiếu thì báo lỗi ngay trong hộp thoại.
- Lưu/mở `.nxf` (zip: `manifest.json` + `model.json`), Ctrl+S / Ctrl+Shift+S / Ctrl+O, hỏi trước khi bỏ thay đổi chưa lưu. Bản desktop dùng hộp thoại hệ điều hành và ghi file an toàn (file tạm rồi đổi tên); bản trình duyệt lưu bằng tải xuống.
- Hộp thoại Tuỳ chọn: ngôn ngữ, giao diện, đơn vị, khôi phục bố cục.
- Chưa có (để đúng giai đoạn): thư viện tiết diện thép cán (A992/IPE/HEA…), sinh tổ hợp tự động theo tiêu chuẩn (Giai đoạn 10), modifiers/cốt thép của tiết diện.

### Giai đoạn 3: View 2D/3D và công cụ vẽ — ✅ xong (07/11/2026)
- Plan/Elevation/3D và chọn window/crossing đã có từ Giai đoạn 1.
- Vẽ bằng chuột ở mặt bằng và mặt đứng: nút (J), dầm (B), cột (C), giằng (R), sàn (S), vách (W). Dầm/giằng/vách vẽ nối tiếp; sàn theo đa giác (bấm lại điểm đầu, Enter hoặc chuột phải để đóng); Backspace bỏ điểm, Esc huỷ.
- Bắt điểm: nút, giao lưới (và giao trục với cao độ tầng ở mặt đứng), trung điểm thanh, điểm trên trục; dấu bắt điểm có nhãn; Shift khoá phương ngang/dọc; bật/tắt từng loại ở thanh trạng thái.
- Phạm vi tầng khi vẽ ở mặt bằng: một tầng / tầng tương tự / tất cả tầng; mỗi lần vẽ nhiều tầng là một bước Undo.
- Panel Properties khi vẽ: chọn tiết diện sẽ gán, phạm vi tầng, gợi ý thao tác.
- Replicate (Ctrl+R): tịnh tiến nhiều bản, đối xứng qua trục, sao chép sang tầng khác (giữ đúng cao độ khi tầng cao khác nhau), có sao chép tải; tự bỏ qua bản trùng.
- Chưa làm: vẽ trong khung 3D, nhân bản xoay (radial), chia thanh, gộp nút, di chuyển/kéo giãn đối tượng, bắt điểm vuông góc/giao điểm, vẽ nhanh bằng một lần bấm vào ô lưới.

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
