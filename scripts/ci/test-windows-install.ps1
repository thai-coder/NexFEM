<#
  Kiểm tra bộ cài NexFEM trên Windows (chạy trong CI, quyền quản trị).

  - Cài im lặng cho toàn máy (per-machine), kiểm tra thư mục Program Files, quyền đọc của nhóm Users
    và lối tắt Start Menu chung.
  - Chạy app ở chế độ tự kiểm tra (NEXFEM_SMOKE_TEST) bằng tài khoản hiện tại và bằng một tài khoản
    người dùng thường mới tạo: app phải mở được giao diện, ghi báo cáo rồi tự thoát.
  - Gỡ cài đặt và kiểm tra đã gỡ sạch.

  Dùng: pwsh scripts/ci/test-windows-install.ps1 -Kind msi|nsis -Installer <đường dẫn>
#>
param(
  [Parameter(Mandatory)] [ValidateSet("msi", "nsis")] [string] $Kind,
  [Parameter(Mandatory)] [string] $Installer
)

$ErrorActionPreference = "Stop"
$InstallDir = Join-Path $env:ProgramFiles "NexFEM"
$Results = [ordered]@{}

function Step($name) { Write-Host "`n=== $name ===" -ForegroundColor Cyan }

function Find-Exe {
  $exe = Get-ChildItem $InstallDir -Filter *.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch "^uninstall" } | Select-Object -First 1
  if (-not $exe) { throw "Không thấy file .exe của NexFEM trong $InstallDir" }
  return $exe.FullName
}

function Invoke-SmokeAsCurrentUser($exe, $out) {
  Remove-Item $out -ErrorAction SilentlyContinue
  $env:NEXFEM_SMOKE_TEST = $out
  try {
    $p = Start-Process -FilePath $exe -PassThru
    if (-not $p.WaitForExit(120000)) { $p.Kill(); throw "App không tự thoát sau 120 giây" }
  } finally {
    Remove-Item Env:NEXFEM_SMOKE_TEST -ErrorAction SilentlyContinue
  }
  if (-not (Test-Path $out)) { throw "App chạy nhưng không ghi báo cáo (giao diện không tải được?)" }
  $r = Get-Content $out -Raw | ConvertFrom-Json
  if (-not $r.ok) { throw "Báo cáo không hợp lệ: $(Get-Content $out -Raw)" }
  Write-Host "OK: user=$($r.user) data=$($r.appLocalData) version=$($r.version)"
  return $r
}

function Invoke-SmokeAsStandardUser($exe) {
  $name = "nxtest$((Get-Random -Maximum 9999))"
  # Tối đa 14 ký tự: dài hơn thì "net user" dừng lại hỏi xác nhận.
  $pw = "Nx!" + [guid]::NewGuid().ToString("N").Substring(0, 9) + "a1"
  $out = "C:\Users\Public\nexfem-smoke-$name.json"
  Remove-Item $out -ErrorAction SilentlyContinue
  net user $name $pw /add | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Không tạo được tài khoản thử $name" }
  try {
    # Không thêm vào nhóm Administrators: đây là tài khoản người dùng thường.
    $cred = New-Object System.Management.Automation.PSCredential($name, (ConvertTo-SecureString $pw -AsPlainText -Force))
    $cmd = "/c set NEXFEM_SMOKE_TEST=$out&& `"$exe`""
    $p = Start-Process -FilePath "cmd.exe" -ArgumentList $cmd -Credential $cred -LoadUserProfile -WorkingDirectory "C:\Users\Public" -PassThru
    if (-not $p.WaitForExit(180000)) { $p.Kill(); throw "App không tự thoát sau 180 giây (tài khoản $name)" }
    if (-not (Test-Path $out)) { throw "App không ghi báo cáo khi chạy bằng tài khoản thường $name (mã thoát $($p.ExitCode))" }
    $r = Get-Content $out -Raw | ConvertFrom-Json
    Write-Host "OK: user=$($r.user) data=$($r.appLocalData)"
    return $r
  } finally {
    net user $name /delete | Out-Null
    Remove-Item $out -ErrorAction SilentlyContinue
  }
}

# ---------------------------------------------------------------- cài đặt
Step "Cài $Kind cho toàn máy: $Installer"
if ($Kind -eq "msi") {
  $log = Join-Path $env:RUNNER_TEMP "nexfem-msi-install.log"
  $p = Start-Process msiexec.exe -ArgumentList "/i `"$Installer`" /qn ALLUSERS=1 /l*v `"$log`"" -Wait -PassThru
  if ($p.ExitCode -ne 0) { Get-Content $log -Tail 60; throw "msiexec trả về $($p.ExitCode)" }
} else {
  $p = Start-Process $Installer -ArgumentList "/S" -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "Bộ cài NSIS trả về $($p.ExitCode)" }
}
$exe = Find-Exe
Write-Host "Đã cài: $exe"
$Results["Cài vào Program Files"] = $exe

Step "Quyền truy cập cho mọi tài khoản"
$acl = (icacls $InstallDir) -join "`n"
Write-Host $acl
if ($acl -notmatch "BUILTIN\\Users:.*\(RX\)" -and $acl -notmatch "BUILTIN\\Users:\(I\)\(OI\)\(CI\)\(RX\)") {
  throw "Nhóm Users không có quyền đọc/chạy trong $InstallDir"
}
$Results["Nhóm Users đọc/chạy được"] = "có"

$commonMenu = Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs"
$lnk = Get-ChildItem $commonMenu -Recurse -Filter "NexFEM*.lnk" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $lnk) { throw "Không thấy lối tắt NexFEM trong Start Menu chung ($commonMenu)" }
Write-Host "Lối tắt Start Menu chung: $($lnk.FullName)"
$Results["Lối tắt Start Menu cho mọi người"] = $lnk.FullName

$wv = Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue
Write-Host "WebView2 runtime: $($wv.pv)"

# ---------------------------------------------------------------- chạy thử
Step "Chạy thử bằng tài khoản hiện tại (quản trị)"
$admin = Invoke-SmokeAsCurrentUser $exe (Join-Path $env:RUNNER_TEMP "nexfem-smoke-admin.json")
$Results["Chạy bằng tài khoản quản trị"] = $admin.user

Step "Chạy thử bằng tài khoản người dùng thường"
$user = Invoke-SmokeAsStandardUser $exe
if ($user.appLocalData -eq $admin.appLocalData) { throw "Hai tài khoản dùng chung thư mục dữ liệu: $($user.appLocalData)" }
$Results["Chạy bằng tài khoản thường"] = "$($user.user) (dữ liệu riêng: $($user.appLocalData))"

# ---------------------------------------------------------------- gỡ cài đặt
Step "Gỡ cài đặt"
if ($Kind -eq "msi") {
  $p = Start-Process msiexec.exe -ArgumentList "/x `"$Installer`" /qn" -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "Gỡ MSI trả về $($p.ExitCode)" }
} else {
  $un = Join-Path $InstallDir "uninstall.exe"
  $p = Start-Process $un -ArgumentList "/S" -Wait -PassThru
  # Trình gỡ NSIS tự sao chép ra thư mục tạm rồi chạy tiếp; đợi nó xoá xong.
  for ($i = 0; $i -lt 30 -and (Test-Path (Join-Path $InstallDir "*.exe")); $i++) { Start-Sleep 2 }
}
if (Get-ChildItem $InstallDir -Filter *.exe -ErrorAction SilentlyContinue) { throw "Gỡ cài đặt chưa xoá hết file trong $InstallDir" }
$Results["Gỡ cài đặt sạch"] = "có"

Step "Kết quả ($Kind)"
$Results.GetEnumerator() | ForEach-Object { Write-Host ("  ✔ {0}: {1}" -f $_.Key, $_.Value) }
if ($env:GITHUB_STEP_SUMMARY) {
  "### Kiểm tra bộ cài $Kind`n" | Out-File $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
  $Results.GetEnumerator() | ForEach-Object { "- ✔ **$($_.Key)**: $($_.Value)" } | Out-File $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
}
