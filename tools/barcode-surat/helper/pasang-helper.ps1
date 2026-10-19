# Memasang Helper Barcode SUMAKER (cukup sekali per komputer)
$ErrorActionPreference = 'Stop'
$asal = Split-Path -Parent $MyInvocation.MyCommand.Path
$sumber = Join-Path $asal 'helper-barcode.ps1'
if (-not (Test-Path -LiteralPath $sumber)) { Write-Host 'File helper-barcode.ps1 tidak ditemukan. Ekstrak dulu ZIP-nya, lalu jalankan lagi.'; exit 1 }
$dir = Join-Path $env:LOCALAPPDATA 'BarcodeSumaker'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
# hentikan helper lama (bila ada) supaya versi baru yang berjalan
try { Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*helper-barcode.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } } catch {}
$tujuan = Join-Path $dir 'helper-barcode.ps1'
Copy-Item -LiteralPath $sumber -Destination $tujuan -Force
try { Unblock-File -LiteralPath $tujuan -ErrorAction SilentlyContinue } catch {}   # tidak ada di PowerShell 2.0 (Windows 7); tidak apa-apa
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arg = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $tujuan + '"'
# aktif otomatis setiap komputer dinyalakan
$startup = [Environment]::GetFolderPath('Startup')
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup 'Helper Barcode SUMAKER.lnk'))
$lnk.TargetPath = $ps; $lnk.Arguments = $arg; $lnk.WindowStyle = 7; $lnk.Description = 'Helper Barcode SUMAKER'; $lnk.Save()
Start-Process -FilePath $ps -ArgumentList $arg -WindowStyle Hidden
Write-Host 'Menyalakan helper...'
$aktif = $false
for ($i = 0; $i -lt 10 -and -not $aktif; $i++) {
  Start-Sleep -Seconds 1
  try { $wc = New-Object System.Net.WebClient; $wc.Proxy = $null; [void]$wc.DownloadString('http://127.0.0.1:48653/ping'); $aktif = $true } catch {}
}
Write-Host ''
if ($aktif) {
  Write-Host 'BERHASIL. Helper Barcode SUMAKER sudah terpasang dan aktif.'
  Write-Host 'Mulai sekarang surat Word/Excel langsung jadi PDF final cukup dengan tombol kuning.'
  Write-Host 'Helper akan aktif sendiri setiap komputer dinyalakan.'
} else {
  Write-Host 'Helper sudah terpasang, tetapi belum menjawab. Silakan restart komputer, lalu coba lagi.'
}
