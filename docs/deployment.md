# Cài đặt NexFEM trên máy khách

Cập nhật: 07/11/2026 · Quyết định: [ADR 0005](adr/0005-deployment.md)

## Yêu cầu

| Mục | Yêu cầu |
| --- | --- |
| Hệ điều hành | Windows 10 (1809 trở lên) hoặc Windows 11, 64-bit |
| Quyền cài đặt | Quản trị (cài cho toàn máy) |
| Runtime | Không cần cài thêm: không .NET, không VC++ Redistributable. WebView2 có sẵn trên Windows 11; nếu thiếu, bộ cài tự cài bản offline kèm theo |
| Mạng | Không cần khi cài đặt |

## Bộ cài

Tải ở bản phát hành mới nhất (GitHub → Releases → "Latest", tên `NexFEM 0.1.<số>`), mỗi lần CI đạt tự có một bản mới; hoặc nhánh `installer` (file cắt phần, ghép bằng `GHEP-BO-CAI.bat`); hoặc mục **Artifacts** của lần chạy CI. Có hai loại, chọn một:

| File | Dùng khi |
| --- | --- |
| `NexFEM_<phiên bản>_x64_en-US.msi` | Triển khai hàng loạt qua Group Policy, Intune, SCCM |
| `NexFEM_<phiên bản>_x64-setup.exe` | Cài tay từng máy |

Mỗi bộ cài khoảng 220 MB vì đã gói sẵn WebView2 bản offline.

## Cài đặt

**Cài tay:** chạy bộ cài bằng tài khoản quản trị → NexFEM xuất hiện trong Start Menu của mọi tài khoản.

**Cài im lặng (quản trị viên):**

```bat
:: MSI, cho toàn máy
msiexec /i NexFEM_0.1.0_x64_en-US.msi /qn ALLUSERS=1 /l*v nexfem-install.log

:: hoặc NSIS
NexFEM_0.1.0_x64-setup.exe /S
```

**Gỡ cài đặt:**

```bat
msiexec /x NexFEM_0.1.0_x64_en-US.msi /qn
:: hoặc
"C:\Program Files\NexFEM\uninstall.exe" /S
```

## Nhiều người dùng trên một máy

- Chương trình cài một lần vào `C:\Program Files\NexFEM`, mọi tài khoản dùng chung.
- Mỗi tài khoản có dữ liệu riêng: tuỳ chọn, bố cục cửa sổ, file gần đây (`%LOCALAPPDATA%\io.github.thai-coder.nexfem`). Người này đổi giao diện không ảnh hưởng người khác.
- File dự án `.nxf` lưu ở nơi người dùng chọn. Muốn làm chung, đặt trên ổ mạng; mỗi lần chỉ nên một người sửa một file (chưa có khoá file — sẽ thêm khi làm cộng tác).
- Máy chủ Remote Desktop (RDS): cài bằng quản trị viên ở chế độ cài đặt (`change user /install` trước, `change user /execute` sau), mỗi phiên người dùng chạy độc lập.

## Kiểm tra tự động

Mỗi lần đẩy code, CI trên máy Windows thật:

1. cài im lặng bộ cài MSI cho toàn máy;
2. kiểm tra thư mục `Program Files`, quyền đọc/chạy của nhóm `Users`, lối tắt Start Menu chung;
3. chạy app bằng tài khoản quản trị và bằng một tài khoản người dùng thường mới tạo, xác nhận giao diện tải xong và mỗi tài khoản có thư mục dữ liệu riêng;
4. gỡ cài đặt và kiểm tra đã gỡ sạch;
5. lặp lại với bộ cài NSIS.

Kết quả ghi ở phần **Summary** của lần chạy CI. Máy CI là Windows Server của GitHub Actions (đã có WebView2), nên chưa thay thế được một lần cài thử trên máy Windows 10/11 thật chưa có WebView2.

Tài khoản thường được chạy thử bằng Task Scheduler để có phiên đăng nhập riêng, giống người dùng thật đăng nhập máy. Chạy bằng `runas`/`Start-Process -Credential` vào màn hình của người khác sẽ báo lỗi WebView2 "Access is denied" — đó là giới hạn của cách chạy, không phải lỗi cài đặt. Script: [`scripts/ci/test-windows-install.ps1`](../scripts/ci/test-windows-install.ps1).

## Kiểm tra bằng tay sau khi cài

Chạy với biến môi trường `NEXFEM_SMOKE_TEST`: app mở, ghi báo cáo rồi tự thoát.

```bat
set NEXFEM_SMOKE_TEST=%TEMP%\nexfem-check.json
"C:\Program Files\NexFEM\NexFEM.exe"
type %TEMP%\nexfem-check.json
```

## Chưa có

- Chữ ký số cho bộ cài (SmartScreen sẽ cảnh báo "Windows protected your PC" → More info → Run anyway).
- Bộ cài tiếng Việt.
- Tự động cập nhật.
