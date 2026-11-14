@echo off
cd /d "%~dp0"
copy /b "NexFEM_0.1.153_x64-setup.exe.part*" "NexFEM_0.1.153_x64-setup.exe" >nul
echo Da ghep: NexFEM_0.1.153_x64-setup.exe
certutil -hashfile "NexFEM_0.1.153_x64-setup.exe" SHA256
echo SHA256 dung phai la: e0eb80dfa608ba2f06313c20a9d46d3b25896ded258ca9c9d773547e5de5fa61
pause
