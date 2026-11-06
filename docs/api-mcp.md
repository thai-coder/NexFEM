# API cục bộ và MCP của NexFEM

Cập nhật: 06/11/2026 · Quyết định: [ADR 0004](adr/0004-api-mcp.md)

## Tổng quan

```
 Claude Desktop / Claude Code / client MCP khác
        │ MCP (stdio)
        ▼
 nexfem-mcp.exe ─────────┐
                          │ HTTP + token
 Python SDK · workflows ──┤
 Excel (Power Query/VBA) ─┤
 Công cụ khác ────────────┘
                          ▼
 ┌──────────── NexFEM (Tauri) ─────────────────────────────────────────┐
 │ src-tauri/api  (axum, 127.0.0.1, /api/v1, SSE)                       │
 │    │ xác thực token → kiểm tra phạm vi → xác nhận nếu là lệnh ghi    │
 │    ▼                                                                 │
 │ Tauri event "api:command" ──► webview: command registry (model-core) │
 │    ▲                              │ Undo/Redo, cập nhật giao diện     │
 │    └──── kết quả JSON ◄───────────┘                                  │
 │ Lệnh chạy phân tích → solver Rust (job bất đồng bộ, tiến trình SSE)  │
 │ Lệnh liên thông CSI → nexfem-csi-bridge.exe (.NET 10, JSON-RPC)       │
 └──────────────────────────────────────────────────────────────────────┘
```

## Luồng một lệnh từ bên ngoài

1. Client (AI qua MCP, script Python, Excel) gửi yêu cầu.
2. `nexfem-mcp` (nếu là MCP) chuyển tool call thành lời gọi REST, gắn token.
3. API kiểm tra token và phạm vi (`read`, `write`, `run`, `interop`).
4. Lệnh ghi: áp dụng chính sách xác nhận. Mặc định app hiện hộp thoại "Client X muốn thêm 24 dầm vào Tầng 3 — Cho phép / Từ chối".
5. API phát Tauri event `api:command` kèm `requestId`; webview chạy lệnh qua command registry, ghi một bước Undo, cập nhật view.
6. Webview trả kết quả qua lệnh Tauri `api_reply`; API trả JSON cho client (hết thời gian chờ sau 30 giây thì trả lỗi 504).
7. Mọi lệnh được ghi vào panel Console với tên client.

## Kết nối và bảo mật

- Khi app mở, API lắng nghe `127.0.0.1` ở cổng mặc định `47821` (đổi trong Preferences). Không bao giờ lắng nghe trên mạng ngoài.
- Thông tin kết nối ghi ở `%APPDATA%\NexFEM\api.json`: `{ "port": 47821, "token": "…" }`. Token sinh lại mỗi lần mở app; file chỉ người dùng hiện tại đọc được.
- Header: `Authorization: Bearer <token>`. Không bật CORS, nên trang web lạ không gọi được.
- Phạm vi theo client (Preferences → API & MCP): `read` · `write` · `run` · `interop`.
- Chính sách lệnh ghi: hỏi mỗi lần (mặc định) / hỏi một lần mỗi phiên / luôn cho phép client tin cậy.
- Chế độ "Chỉ đọc" tắt mọi lệnh ghi bằng một công tắc trên status bar.

## REST API v1

| Nhóm | Phương thức & đường dẫn | Mô tả | Phạm vi |
| --- | --- | --- | --- |
| Hệ thống | `GET /api/v1/health` | Phiên bản app, trạng thái mô hình (khóa/mở) | — |
| Dự án | `GET /api/v1/project` · `POST /project/open` · `POST /project/save` | Thông tin, mở, lưu `.nxf` | read / write |
| Mô hình | `GET /api/v1/model/summary` | Số nút, phần tử, tầng, đơn vị | read |
| Mô hình | `GET\|POST /api/v1/model/{collection}` | Liệt kê / thêm | read / write |
| Mô hình | `GET\|PATCH\|DELETE /api/v1/model/{collection}/{id}` | Xem / sửa / xóa | read / write |
| Lệnh | `GET /api/v1/commands` | Danh sách lệnh kèm JSON Schema | read |
| Lệnh | `POST /api/v1/commands/{name}` | Chạy một lệnh bất kỳ trong registry | write |
| Lệnh | `POST /api/v1/undo` · `POST /api/v1/redo` | Hoàn tác / làm lại | write |
| Phân tích | `POST /api/v1/analysis/jobs` | Chạy các case → `202 { jobId }` | run |
| Phân tích | `GET /api/v1/analysis/jobs/{id}` · `DELETE …` | Trạng thái / hủy | run |
| Kết quả | `GET /api/v1/results/{type}?case=&story=&ids=` | `joint-displacements`, `reactions`, `frame-forces`, `story-drifts`, `modes` | read |
| Thiết kế | `POST /api/v1/design/checks` · `GET /api/v1/design/results` | Kiểm tra theo tiêu chuẩn, kết quả có số điều khoản | run / read |
| Liên thông | `POST /api/v1/interop/csi-file/import` · `/export` | `.e2k`/`.s2k` | interop |
| Liên thông | `POST /api/v1/interop/csi/pull` · `/push` · `/run` | Qua cầu nối OAPI (.NET 10) | interop |
| Sự kiện | `GET /api/v1/events` (SSE) | `model.changed`, `selection.changed`, `analysis.progress`, `analysis.done`, `model.locked` | read |

`{collection}`: `grids`, `stories`, `materials`, `frame-sections`, `shell-sections`, `joints`, `frames`, `shells`, `load-patterns`, `load-cases`, `combos`, `groups`.

Lỗi trả theo RFC 9457 (`application/problem+json`), ví dụ mô hình đang khóa sau phân tích → `409` kèm `"hint": "unlock"`.

## MCP server `nexfem-mcp`

Cấu hình cho Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "nexfem": { "command": "C:\\Program Files\\NexFEM\\nexfem-mcp.exe" }
  }
}
```

`nexfem-mcp` tự đọc `%APPDATA%\NexFEM\api.json` để lấy cổng và token. Nếu app chưa mở, mọi tool trả lỗi hướng dẫn mở NexFEM.

### Tools

| Tool | Việc làm | Gợi ý cho client |
| --- | --- | --- |
| `get_model_summary` | Tóm tắt mô hình | readOnly |
| `list_objects` / `get_object` | Liệt kê, xem đối tượng theo loại, tầng, nhóm | readOnly |
| `list_commands` | Danh sách lệnh và schema | readOnly |
| `define_material` / `define_section` | Thêm vật liệu, tiết diện (có thư viện TCVN, EN, ASTM) | ghi |
| `create_grid_system` / `add_stories` | Tạo lưới trục và tầng | ghi |
| `add_frames` / `add_shells` | Thêm nhiều dầm, cột, sàn, vách một lần | ghi |
| `assign_section` / `assign_restraints` / `assign_loads` | Gán cho danh sách đối tượng | ghi |
| `define_load_combos` | Tạo tổ hợp, có tùy chọn tự sinh theo tiêu chuẩn | ghi |
| `execute_command` | Chạy lệnh bất kỳ trong registry | ghi |
| `undo` | Hoàn tác bước gần nhất | ghi |
| `run_analysis` | Chạy phân tích, gửi tiến trình qua MCP progress | chạy |
| `get_results` | Lấy kết quả có lọc, giới hạn số dòng | readOnly |
| `run_design_check` / `get_design_results` | Kiểm tra theo tiêu chuẩn | chạy / readOnly |
| `import_csi_file` / `export_csi_file` | Nhập/xuất `.e2k`/`.s2k` | liên thông |
| `csi_pull_model` / `csi_push_model` | Lấy/đẩy mô hình với ETABS/SAP2000 đang mở | liên thông, destructive khi đẩy |

Tool ghi khai báo `destructiveHint`/`idempotentHint` đúng thực tế; app vẫn áp dụng chính sách xác nhận phía mình, không dựa vào client.

### Resources

- `nexfem://model/summary`, `nexfem://model/{collection}`
- `nexfem://results/{case}/{type}`
- `nexfem://codes/{code}` — danh mục phép kiểm tra và số điều khoản (không chứa nguyên văn tiêu chuẩn)

### Prompts

- `build_rc_frame` — dựng khung BTCT từ lưới, số tầng, tiết diện
- `check_story_drift` — chạy phân tích và đánh giá drift theo tiêu chuẩn đã chọn
- `compare_with_etabs` — lấy mô hình từ ETABS, chạy cả hai bên, so sánh kết quả

## SDK

- `sdk/python/` — gói `nexfem` (sinh từ OpenAPI, thêm lớp tiện ích):

  ```python
  from nexfem import Client
  nx = Client.connect()                     # đọc %APPDATA%\NexFEM\api.json
  nx.model.create_grid_system(x=[0, 6, 12], y=[0, 7.2], stories=[3.6] * 5)
  job = nx.analysis.run(["DL", "LL", "EQX"])
  drifts = nx.results.story_drifts(case="EQX")
  ```
- `sdk/typescript/` — cho add-in Excel (Office.js) và công cụ web.

## Trợ lý AI trong app (giai đoạn sau)

- Panel "Assistant" dock được, tắt mặc định; người dùng tự nhập API key của nhà cung cấp mô hình.
- Là MCP client: dùng MCP server của NexFEM và các MCP server ngoài người dùng thêm (ví dụ thư mục dự án, bảng tính tải trọng, kho tài liệu công ty).
- Mọi lệnh ghi đi qua cùng chính sách xác nhận như client ngoài.

## Vị trí trong repo

```
apps/desktop/src-tauri/src/api/   # axum: routes, auth, sse, bridge tới webview
apps/mcp/                         # nexfem-mcp (Rust, rmcp)
crates/api-types/                 # kiểu dữ liệu API dùng chung + OpenAPI (utoipa)
packages/model-core/commands/     # command registry + schema (zod)
apps/desktop/src/services/api-bridge/  # webview nhận api:command, trả api_reply
sdk/python/  sdk/typescript/      # SDK sinh từ OpenAPI
bridge/csi/                       # Nexfem.CsiBridge (.NET 10)
workflows/                        # script mẫu dùng Python SDK
tests/api/                        # test hợp đồng API + MCP (chạy trên CI)
```

## Kiểm thử

- Test hợp đồng: sinh request từ OpenAPI, chạy với app ở chế độ test (webview giả lập registry).
- Test MCP: chạy `nexfem-mcp` với MCP Inspector và kịch bản tool call trong `tests/api/mcp/`.
- Test bảo mật: không token → 401; sai phạm vi → 403; gọi từ địa chỉ không phải loopback → không kết nối được.
