# Menghapus Helper Barcode SUMAKER dari komputer ini
try { Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*helper-barcode.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } } catch {}
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Startup')) 'Helper Barcode SUMAKER.lnk') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'BarcodeSumaker') -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'Helper Barcode SUMAKER sudah dihapus dari komputer ini.'
