# ADR 0004: API cục bộ và MCP

- Trạng thái: Đã chấp nhận
- Ngày: 06/11/2026

## Bối cảnh

Người dùng muốn NexFEM kết nối được với nhiều công cụ bên ngoài: script Python, Excel, ETABS/SAP2000, và trợ lý AI. Cần một cửa vào duy nhất, an toàn, không làm lệch dữ liệu giữa giao diện và các công cụ ngoài.

## Quyết định

1. **Command registry dùng chung.** Mọi thao tác trên mô hình là một lệnh trong `packages/model-core/commands`, có schema đầu vào (zod → JSON Schema). Giao diện, console, API và MCP đều gọi cùng registry, nên mỗi thao tác từ bên ngoài cũng có Undo/Redo và giao diện cập nhật ngay.
2. **API cục bộ** trong backend Tauri (`apps/desktop/src-tauri/src/api/`, Rust + axum):
   - REST/JSON `/api/v1`, mô tả bằng OpenAPI 3.1 (sinh từ kiểu Rust bằng utoipa).
   - Sự kiện thời gian thực qua SSE `/api/v1/events`.
   - Chỉ lắng nghe `127.0.0.1`, bắt buộc token.
3. **MCP server** `nexfem-mcp` (Rust, SDK `rmcp`) trong `apps/mcp/`:
   - Transport stdio cho Claude Desktop, Claude Code và các client MCP khác; chuyển mỗi tool call thành lời gọi API cục bộ.
   - Giai đoạn sau: endpoint Streamable HTTP `/mcp` phục vụ trực tiếp từ app.
4. **SDK** Python và TypeScript sinh từ OpenAPI, đặt trong `sdk/`. `workflows/` dùng Python SDK.
5. **Trợ lý AI trong app** (giai đoạn sau, tắt mặc định): panel chat đóng vai trò MCP client, dùng MCP server của chính NexFEM và các MCP server ngoài do người dùng thêm.

Chi tiết endpoint, tool, luồng xử lý: [`docs/api-mcp.md`](../api-mcp.md).

## Phương án đã cân nhắc

- **gRPC:** nhanh nhưng khó dùng từ Excel/Python đơn giản. Không chọn.
- **MCP server gọi thẳng solver, bỏ qua app:** nhanh hơn nhưng mô hình trong app và mô hình MCP lệch nhau, mất Undo. Không chọn cho v1; chế độ headless làm riêng sau.
- **Viết MCP server bằng TypeScript:** cũng được, nhưng chọn Rust để đóng gói một file `.exe` cạnh app, không cần Node.

## Hệ quả

- Lệnh từ API/MCP được thực thi trong webview (nơi có kho mô hình), nên app phải đang mở. Chế độ không giao diện (`nexfem-cli` chạy model-core trên Node + solver native) để giai đoạn sau.
- Mọi lệnh ghi từ bên ngoài phải qua chính sách xác nhận và được ghi vào nhật ký (panel Console).
- Thay đổi schema lệnh là thay đổi API: phải tăng phiên bản (`/api/v2`) nếu không tương thích ngược.
