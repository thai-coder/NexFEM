@echo off
cd /d "%~dp0"
copy /b "NexFEM_0.1.196_x64-setup.exe.part*" "NexFEM_0.1.196_x64-setup.exe" >nul
echo Da ghep: NexFEM_0.1.196_x64-setup.exe
certutil -hashfile "NexFEM_0.1.196_x64-setup.exe" SHA256
echo SHA256 dung phai la: 144d0957165385df435ced905b3a6ed5e7faebd24e53e0da124067f3959dfec7
pause
