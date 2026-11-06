# ADR 0002: Liên thông ETABS/SAP2000

- Trạng thái: Đã chấp nhận (sửa đổi 06/11/2026: cầu nối OAPI chuyển từ Python sang C# .NET 10)
- Ngày: 06/11/2026

## Bối cảnh

Người dùng cần trao đổi mô hình và kết quả với ETABS/SAP2000. CSI OAPI chỉ hoạt động trên Windows khi đã cài ETABS/SAP2000 có giấy phép; môi trường phát triển (cloud, CI) không có các phần mềm này. CSI phát hành OAPI dưới dạng thư viện .NET và ví dụ chính thức bằng C#.

## Quyết định

Hai kênh, độc lập với nhau:

1. **Kênh file (ưu tiên):** đọc/ghi file văn bản `.e2k` (ETABS) và `.s2k` (SAP2000) trong `packages/io-formats/csi/`. Không cần cài CSI, kiểm thử được trên CI bằng các file mẫu.
2. **Kênh OAPI:** cầu nối **C# .NET 10 (LTS)** trong `bridge/csi/` (`Nexfem.CsiBridge`), publish self-contained single-file `win-x64` thành `nexfem-csi-bridge.exe`. Tauri chạy nó như sidecar, trao đổi JSON-RPC 2.0 qua stdin/stdout. Phương thức: `attach`, `open`, `pullModel`, `pushModel`, `run`, `getResults`, `close`.

Script tự động hóa trong `workflows/` viết bằng Python nhưng **không gọi COM trực tiếp**: chúng dùng Python SDK của NexFEM qua API cục bộ (ADR 0004), và API chuyển các lệnh liên thông xuống cầu nối .NET.

## Lý do chọn .NET 10

- CSI hỗ trợ chính thức C#/.NET; kiểu dữ liệu chặt chẽ, bắt lỗi lúc biên dịch thay vì lúc chạy như `comtypes`.
- .NET 10 là bản LTS (hỗ trợ đến 11/2028), nhận bản vá bảo mật đều đặn.
- Publish self-contained: máy người dùng không cần cài .NET runtime.

## Rủi ro cần kiểm tra khi bắt đầu Giai đoạn 8

- DLL API của từng phiên bản ETABS/SAP2000 có nạp được từ .NET 10 không (bản mới phát hành thư viện dạng .NET Standard; bản cũ chỉ có .NET Framework).
- .NET hiện đại không còn `Marshal.GetActiveObject`, nên gắn vào phiên đang mở phải dùng hàm trợ giúp của CSI (`cHelper.GetObject` hoặc tương đương trong phiên bản đó).
- Ghi danh sách phiên bản ETABS/SAP2000 đã kiểm tra thủ công trong `bridge/csi/README.md`.

## Phương án đã cân nhắc

- **Python + comtypes:** viết nhanh nhưng kiểu dữ liệu lỏng, đóng gói PyInstaller dễ bị phần mềm diệt virus báo nhầm. Không chọn.
- **Rust gọi COM trực tiếp:** phức tạp, ít ví dụ, khó bảo trì.

## Hệ quả

- Phần chuyển đổi dữ liệu (CSI ↔ schema NexFEM) tách khỏi lời gọi OAPI, kiểm thử bằng `dotnet test` với bản giả lập trên Linux/CI.
- Phần gọi OAPI thật chỉ kiểm thử được trên máy người dùng có ETABS/SAP2000.
- CI cần thêm bước `dotnet publish` trong job `windows-latest`.
