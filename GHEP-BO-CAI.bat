@echo off
cd /d "%~dp0"
copy /b "NexFEM_0.1.170_x64-setup.exe.part*" "NexFEM_0.1.170_x64-setup.exe" >nul
echo Da ghep: NexFEM_0.1.170_x64-setup.exe
certutil -hashfile "NexFEM_0.1.170_x64-setup.exe" SHA256
echo SHA256 dung phai la: a562b370d0b735ce9c633d6f5f7ec89e3a87a10877758f4414c82715391a92a7
pause
