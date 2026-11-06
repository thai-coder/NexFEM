# ADR 0002: Liên thông ETABS/SAP2000

- Trạng thái: Đã chấp nhận
- Ngày: 06/11/2026

## Bối cảnh

Người dùng cần trao đổi mô hình và kết quả với ETABS/SAP2000. CSI OAPI chỉ hoạt động trên Windows khi đã cài ETABS/SAP2000 có giấy phép; môi trường phát triển (cloud, CI) không có các phần mềm này.

## Quyết định

Hai kênh, độc lập với nhau:

1. **Kênh file (ưu tiên):** đọc/ghi file văn bản `.e2k` (ETABS) và `.s2k` (SAP2000) trong `packages/io-formats/csi/`. Không cần cài CSI, kiểm thử được trên CI bằng các file mẫu.
2. **Kênh OAPI:** cầu nối Python (`bridge/csi/`, dùng `comtypes`) chạy trên máy Windows có ETABS/SAP2000. Đóng gói bằng PyInstaller thành `nexfem-csi-bridge.exe`, chạy như sidecar của Tauri, trao đổi JSON qua stdin/stdout. Chức năng: gắn vào phiên đang mở hoặc mở phiên mới, lấy/đẩy mô hình, chạy phân tích, lấy kết quả.

Script tự động hóa mẫu đặt trong `workflows/` và dùng chung cầu nối Python.

## Phương án đã cân nhắc

- **C# (.NET 8):** CSI hỗ trợ chính thức, kiểu dữ liệu chặt chẽ hơn. Không chọn vì người dùng muốn vibe code workflow bằng Python; có thể chuyển sau nếu `comtypes` gặp giới hạn.
- **Rust gọi COM trực tiếp:** phức tạp, ít ví dụ, khó bảo trì.

## Hệ quả

- Phần logic chuyển đổi dữ liệu được viết tách khỏi lời gọi COM để kiểm thử bằng bản giả lập trên Linux.
- Phần gọi OAPI thật chỉ kiểm thử được trên máy người dùng; cần danh sách kiểm tra thủ công cho từng phiên bản ETABS/SAP2000 hỗ trợ.
