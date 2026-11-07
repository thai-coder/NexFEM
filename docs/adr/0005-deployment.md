# ADR 0005: Triển khai trên máy khách nhiều người dùng

- Trạng thái: Đã chấp nhận
- Ngày: 07/11/2026

## Bối cảnh

NexFEM cần cài được trên máy khách Windows có nhiều tài khoản (máy dùng chung trong văn phòng, máy chủ Remote Desktop) chỉ bằng một bộ cài, không phải cài thêm runtime nào.

## Quyết định

- **Không phụ thuộc .NET.** Ứng dụng là Tauri 2: một file `NexFEM.exe` (Rust) và giao diện chạy trên Microsoft Edge WebView2. CRT của Visual C++ được link tĩnh, nên không cần cài VC++ Redistributable.
- **Cài cho toàn máy (per-machine):** MSI và NSIS đều cài vào `C:\Program Files\NexFEM`, tạo lối tắt trong Start Menu chung. Cần quyền quản trị để cài; mọi tài khoản trên máy đều chạy được.
- **WebView2 gói sẵn (offline installer):** nếu máy chưa có WebView2 (Windows 10 LTSC, máy không có mạng), bộ cài tự cài bản offline kèm theo. Đổi lại, bộ cài nặng thêm khoảng 130 MB.
- **Dữ liệu riêng từng tài khoản:** tuỳ chọn giao diện, bố cục, danh sách file gần đây nằm trong `%LOCALAPPDATA%\io.github.thai-coder.nexfem` của từng người. App không ghi vào `Program Files`.
- **File dự án `.nxf`** nằm ở nơi người dùng chọn (thư mục riêng hoặc ổ mạng dùng chung).
- **Cầu nối ETABS/SAP2000 (.NET 10, Giai đoạn 8)** publish self-contained, đi kèm trong bộ cài; máy khách vẫn không cần cài .NET.
- **CI kiểm tra mỗi lần đẩy code:** trên máy Windows của GitHub Actions, cài im lặng từng bộ cài, chạy app bằng tài khoản quản trị và một tài khoản người dùng thường mới tạo, rồi gỡ cài (`scripts/ci/test-windows-install.ps1`).

## Phương án đã cân nhắc

- **Viết lại app trên .NET 10 (WPF/WinUI/Avalonia):** cần cài hoặc đóng gói runtime .NET (~70 MB self-contained), bỏ toàn bộ frontend React và viewer đã làm. Không mang lại lợi ích triển khai so với Tauri.
- **WebView2 dạng download bootstrapper:** bộ cài nhỏ nhưng cần Internet nếu máy chưa có WebView2. Không chọn vì yêu cầu "chỉ cần bộ cài".
- **WebView2 fixed runtime:** không phụ thuộc bản WebView2 của hệ thống nhưng bộ cài ~180 MB và phải tự cập nhật bản vá bảo mật. Để dành nếu gặp máy bị khoá cập nhật Edge.

## Hệ quả

- Bộ cài khoảng 135 MB thay vì ~5 MB.
- Chưa có chữ ký số: SmartScreen cảnh báo khi chạy bộ cài. Cần chứng thư ký mã (code signing) trước khi phát hành rộng.
