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
  [Parameter(Mandatory)] [string] $Installer,
  # Phiên bản mong đợi (ví dụ 0.1.16); để trống thì bỏ qua kiểm tra phiên bản.
  [string] $ExpectedVersion = ""
)

$ErrorActionPreference = "Stop"
$InstallDir = Join-Path $env:ProgramFiles "NexFEM"
$Results = [ordered]@{}

function Step($name) { Write-Host "`n=== $name ===" -ForegroundColor Cyan }

Add-Type -Namespace Win32 -Name Native -MemberDefinition '[DllImport("shell32.dll", CharSet=CharSet.Unicode)] public static extern uint ExtractIconEx(string file, int index, IntPtr[] large, IntPtr[] small, uint n);'

# Kiểm tra thông tin hiển thị ở Properties > Details: công ty, mô tả, phiên bản, biểu tượng.
function Assert-FileInfo($path, $label, $descPattern) {
  $v = (Get-Item $path).VersionInfo
  Write-Host "$label | Company=$($v.CompanyName) | Description=$($v.FileDescription) | FileVersion=$($v.FileVersion) | Product=$($v.ProductName)"
  if ($v.CompanyName -ne "lkat.vn") { throw "${label}: CompanyName phải là lkat.vn (hiện là '$($v.CompanyName)')" }
  if ($v.FileDescription -notlike $descPattern) { throw "${label}: FileDescription '$($v.FileDescription)' không khớp '$descPattern'" }
  if ($ExpectedVersion -and -not "$($v.FileVersion)".StartsWith($ExpectedVersion)) { throw "${label}: FileVersion '$($v.FileVersion)' không bắt đầu bằng $ExpectedVersion" }
  $icons = [Win32.Native]::ExtractIconEx($path, -1, $null, $null, 0)
  if ($icons -lt 1) { throw "${label}: file không có biểu tượng (logo)" }
  Write-Host "$label | biểu tượng: $icons"
}

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
  if (-not (Test-Path $out)) { Show-Panic $out; throw "App chạy nhưng không ghi báo cáo (giao diện không tải được?)" }
  $r = Get-Content $out -Raw | ConvertFrom-Json
  if (-not $r.ok) { throw "Báo cáo không hợp lệ: $(Get-Content $out -Raw)" }
  Write-Host "OK: user=$($r.user) data=$($r.appLocalData) version=$($r.version)"
  return $r
}

function Show-Panic($out) {
  $panic = "$out.panic.txt"
  if (Test-Path $panic) {
    Write-Host "--- panic ---" -ForegroundColor Yellow
    Get-Content $panic -TotalCount 40 | Write-Host
  }
}

function Wait-Report($out, $seconds, [scriptblock] $running) {
  for ($i = 0; $i -lt $seconds; $i++) {
    if (Test-Path $out) { return $true }
    if (-not (& $running)) { Start-Sleep 2; return (Test-Path $out) }
    Start-Sleep 1
  }
  return (Test-Path $out)
}

<#
  Chạy app bằng một tài khoản người dùng thường (không thuộc Administrators).
  Cách A (chẩn đoán): Start-Process -Credential — tiến trình chạy trong màn hình của tài khoản quản trị
           đang đăng nhập; tài khoản khác thường không có quyền tạo cửa sổ ở đó.
  Cách B (bắt buộc): Task Scheduler đăng nhập bằng chính tài khoản đó, trong phiên riêng của nó,
           giống người dùng thật đăng nhập máy.
#>
function Invoke-SmokeAsStandardUser($exe) {
  $name = "nxtest$((Get-Random -Maximum 9999))"
  # Tối đa 14 ký tự: dài hơn thì "net user" dừng lại hỏi xác nhận.
  $pw = "Nx!" + [guid]::NewGuid().ToString("N").Substring(0, 9) + "a1"
  net user $name $pw /add | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Không tạo được tài khoản thử $name" }
  # Quyền "Log on as a batch job" để Task Scheduler đăng nhập được; nhóm này không có quyền quản trị.
  net localgroup "Performance Log Users" $name /add | Out-Null
  $groups = (net user $name) -join " "
  if ($groups -match "\*Administrators") { throw "Tài khoản thử lại thuộc Administrators" }
  $task = "nexfem-smoke-$name"
  try {
    Write-Host "-- Cách A: Start-Process -Credential (chẩn đoán)"
    $outA = "C:\Users\Public\nexfem-smoke-$name-a.json"
    $cred = New-Object System.Management.Automation.PSCredential($name, (ConvertTo-SecureString $pw -AsPlainText -Force))
    $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c set NEXFEM_SMOKE_TEST=$outA&& `"$exe`"" -Credential $cred -LoadUserProfile -WorkingDirectory "C:\Users\Public" -PassThru
    [void](Wait-Report $outA 120 { -not $p.HasExited })
    if (Test-Path $outA) { Write-Host "Cách A: OK $(Get-Content $outA -Raw)" }
    else { Write-Host "Cách A: không có báo cáo (mã thoát $($p.ExitCode))"; Show-Panic $outA }

    Write-Host "-- Cách B: Task Scheduler, phiên đăng nhập riêng của $name"
    $out = "C:\Users\Public\nexfem-smoke-$name.json"
    $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c set NEXFEM_SMOKE_TEST=$out&& `"$exe`"" -WorkingDirectory "C:\Users\Public"
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    Register-ScheduledTask -TaskName $task -Action $action -Settings $settings -User $name -Password $pw -RunLevel Limited | Out-Null
    Start-ScheduledTask -TaskName $task
    $ok = Wait-Report $out 180 { (Get-ScheduledTask -TaskName $task).State -eq "Running" }
    $info = Get-ScheduledTaskInfo -TaskName $task
    Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
    if (-not $ok) {
      Show-Panic $out
      throw "Tài khoản thường ${name}: app không ghi báo cáo (kết quả tác vụ $($info.LastTaskResult))"
    }
    $r = Get-Content $out -Raw | ConvertFrom-Json
    Write-Host "Cách B: OK user=$($r.user) data=$($r.appLocalData)"
    return $r
  } finally {
    Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
    net user $name /delete | Out-Null
    Remove-Item "C:\Users\Public\nexfem-smoke-$name*" -ErrorAction SilentlyContinue
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
if ($Kind -eq "nsis") { Assert-FileInfo $Installer "Bộ cài" "NexFEM*" }
Assert-FileInfo $exe "NexFEM.exe" "NexFEM*"
$Results["Công ty / mô tả / phiên bản / logo của file"] = "lkat.vn · $ExpectedVersion"
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

Step "Kiểu file .nxf: biểu tượng chữ N và mở bằng NexFEM"
$progId = (Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\.nxf" -ErrorAction SilentlyContinue).'(default)'
if (-not $progId) { throw "Bộ cài chưa đăng ký đuôi .nxf (HKCR\.nxf trống)" }
$openKey = "Registry::HKEY_CLASSES_ROOT\$progId\shell\open\command"
$iconKey = "Registry::HKEY_CLASSES_ROOT\$progId\DefaultIcon"
$openCmd = (Get-ItemProperty $openKey -ErrorAction SilentlyContinue).'(default)'
$iconVal = (Get-ItemProperty $iconKey -ErrorAction SilentlyContinue).'(default)'
Write-Host ".nxf -> $progId | lệnh mở: $openCmd | biểu tượng: $iconVal"
if (-not (Test-Path $openKey)) { throw "Thiếu lệnh mở cho $progId ($openKey)" }
if (-not $iconVal -or $iconVal -notlike "*NexFEM.exe*") { throw "Biểu tượng file .nxf không lấy từ NexFEM.exe: '$iconVal'" }
$Results["Kiểu file .nxf"] = "$progId, biểu tượng $iconVal"

# Mở file như bấm đúp trong Explorer (ShellExecute theo kiểu file); tên có khoảng trắng để kiểm tra ngoặc kép "%1".
$sample = Join-Path $env:RUNNER_TEMP "Mau thu.nxf"
Copy-Item (Join-Path $PSScriptRoot "..\..\resources\templates\sample-frame.json") $sample -Force
$openOut = Join-Path $env:RUNNER_TEMP "nexfem-open.json"
Remove-Item $openOut -ErrorAction SilentlyContinue
$env:NEXFEM_SMOKE_TEST = $openOut
try {
  Start-Process -FilePath $sample | Out-Null
  # Tiến trình có thể chưa xuất hiện ngay sau ShellExecute: chỉ chờ báo cáo, tối đa 120 giây.
  for ($i = 0; $i -lt 120 -and -not (Test-Path $openOut); $i++) { Start-Sleep 1 }
  $ok = Test-Path $openOut
} finally {
  Remove-Item Env:NEXFEM_SMOKE_TEST -ErrorAction SilentlyContinue
}
if (-not $ok) { Show-Panic $openOut; throw "Bấm đúp file .nxf không mở được NexFEM (không có báo cáo)" }
$opened = (Get-Content $openOut -Raw | ConvertFrom-Json).opened
Write-Host "Mở bằng bấm đúp: mô hình '$opened'"
if ($opened -ne "Toa_nha_A") { throw "NexFEM mở nhưng không nạp file được bấm đúp (opened = '$opened')" }
$Results["Bấm đúp file .nxf mở đúng mô hình"] = $opened
for ($i = 0; $i -lt 30 -and (Get-Process -Name "NexFEM" -ErrorAction SilentlyContinue); $i++) { Start-Sleep 1 }

Step "Đóng ứng dụng bằng nút đóng cửa sổ (như người dùng bấm X)"
$closeOut = Join-Path $env:RUNNER_TEMP "nexfem-close.json"
Remove-Item $closeOut -ErrorAction SilentlyContinue
$env:NEXFEM_SMOKE_CLOSE = $closeOut
try {
  $p = Start-Process -FilePath $exe -PassThru
  if (-not $p.WaitForExit(90000)) { $p.Kill(); throw "App không thoát sau khi đóng cửa sổ (nút đóng không hoạt động)" }
} finally {
  Remove-Item Env:NEXFEM_SMOKE_CLOSE -ErrorAction SilentlyContinue
}
if (-not (Test-Path $closeOut)) { throw "App thoát nhưng không qua đường đóng cửa sổ bình thường (mã thoát $($p.ExitCode))" }
Write-Host "OK: đóng cửa sổ thoát sạch, mã thoát $($p.ExitCode)"
$Results["Nút đóng cửa sổ hoạt động"] = "có"

Step "Chạy thử bằng tài khoản người dùng thường"
$user = Invoke-SmokeAsStandardUser $exe
if ($user.appLocalData -eq $admin.appLocalData) { throw "Hai tài khoản dùng chung thư mục dữ liệu: $($user.appLocalData)" }
$Results["Chạy bằng tài khoản thường"] = "$($user.user) (dữ liệu riêng: $($user.appLocalData))"

# ---------------------------------------------------------------- gỡ cài đặt
Step "Gỡ cài đặt"
# Trình gỡ NSIS tự huỷ (mã 2) nếu NexFEM.exe còn chạy ở bất kỳ phiên nào; đợi app tắt hẳn.
for ($i = 0; $i -lt 60; $i++) {
  $running = Get-Process -Name "NexFEM" -ErrorAction SilentlyContinue
  if (-not $running) { break }
  Start-Sleep 1
}
if ($running) {
  $running | ForEach-Object { Write-Host "  vẫn chạy: pid $($_.Id) phiên $($_.SessionId)" }
  throw "NexFEM.exe chưa tắt sau 60 giây"
}
if ($Kind -eq "msi") {
  $p = Start-Process msiexec.exe -ArgumentList "/x `"$Installer`" /qn" -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "Gỡ MSI trả về $($p.ExitCode)" }
} else {
  $un = Join-Path $InstallDir "uninstall.exe"
  # "_?=" giữ trình gỡ chạy tại chỗ và chờ xong (không tách ra tiến trình nền trong %TEMP%);
  # khi đó chính uninstall.exe không tự xoá được, nên xoá nó sau cùng.
  $p = Start-Process $un -ArgumentList "/S", "_?=$InstallDir" -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "Gỡ NSIS trả về $($p.ExitCode)" }
  Remove-Item $un -Force -ErrorAction SilentlyContinue
}
$left = Get-ChildItem $InstallDir -Recurse -File -ErrorAction SilentlyContinue
if ($left) {
  Write-Host "File còn lại:"; $left | ForEach-Object { Write-Host "  $($_.FullName)" }
  Get-Process | Where-Object { $_.Path -like "$InstallDir*" } | ForEach-Object { Write-Host "  đang chạy: $($_.Path)" }
  throw "Gỡ cài đặt chưa xoá hết file trong $InstallDir"
}
$reg = Get-ChildItem "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall" -ErrorAction SilentlyContinue |
  Where-Object { (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DisplayName -eq "NexFEM" }
if ($reg) { throw "Còn mục NexFEM trong Programs and Features sau khi gỡ" }
$Results["Gỡ cài đặt sạch"] = "có"

$leftAssoc = (Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\.nxf" -ErrorAction SilentlyContinue).'(default)'
if ($leftAssoc -and (Test-Path "Registry::HKEY_CLASSES_ROOT\$leftAssoc\shell\open\command")) {
  $cmdLeft = (Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\$leftAssoc\shell\open\command").'(default)'
  if ($cmdLeft -like "*NexFEM*") { throw "Gỡ cài đặt còn để lại kiểu file .nxf trỏ tới NexFEM: $cmdLeft" }
}
$Results["Gỡ kiểu file .nxf khi gỡ cài đặt"] = "có"

Step "Kết quả ($Kind)"
$Results.GetEnumerator() | ForEach-Object { Write-Host ("  ✔ {0}: {1}" -f $_.Key, $_.Value) }
if ($env:GITHUB_STEP_SUMMARY) {
  "### Kiểm tra bộ cài $Kind`n" | Out-File $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
  $Results.GetEnumerator() | ForEach-Object { "- ✔ **$($_.Key)**: $($_.Value)" } | Out-File $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
}
