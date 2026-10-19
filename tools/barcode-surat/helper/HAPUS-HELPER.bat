@echo off
title Hapus Helper Barcode SUMAKER
cd /d "%~dp0"
if not exist "%~dp0hapus-helper.ps1" (
  echo File pendukung tidak ditemukan. Ekstrak dulu ZIP-nya: klik kanan, Extract All / Ekstrak Semua, lalu jalankan lagi dari folder hasil ekstrak.
  echo.
  pause
  exit /b 1
)
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0hapus-helper.ps1"
echo.
pause
