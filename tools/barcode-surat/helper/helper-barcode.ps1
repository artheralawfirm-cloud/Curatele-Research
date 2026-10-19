# Helper Barcode SUMAKER
# Berjalan diam-diam di komputer ini dan hanya menerima permintaan dari komputer ini sendiri (127.0.0.1).
# Plugin "SUMAKER Barcode Massal" mengirim surat Word/Excel ke sini; Microsoft Word/Excel mengubahnya ke PDF
# (tampilan persis seperti dibuka di Word/Excel), lalu PDF dikirim balik ke plugin untuk ditempeli QR/gembok/footer.
# Tidak ada data yang dikirim ke luar komputer ini.

$ErrorActionPreference = 'Stop'
$PORT = 48653
$IZIN_ORIGIN = 'https://sumaker.kemenkum.go.id'
$MAKS_BYTE = 60MB
$DIAM_DETIK = 120   # Word/Excel ditutup bila tidak dipakai selama ini
$VERSI = '1'

$kerja = Join-Path $env:TEMP 'barcode-sumaker'
New-Item -ItemType Directory -Force -Path $kerja | Out-Null
$catatan = Join-Path $kerja 'helper.log'
function Tulis($pesan) { Add-Content -LiteralPath $catatan -Value ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $pesan) }

$script:word = $null
$script:excel = $null
$script:terakhir = Get-Date

function Tutup-Office {
  if ($script:word) { try { $script:word.Quit() } catch {}; try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($script:word) } catch {}; $script:word = $null }
  if ($script:excel) { try { $script:excel.Quit() } catch {}; try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($script:excel) } catch {}; $script:excel = $null }
}

function Ambil-Soffice {
  $calon = @()
  if ($env:ProgramFiles) { $calon += (Join-Path $env:ProgramFiles 'LibreOffice\program\soffice.exe') }
  $pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
  if ($pf86) { $calon += (Join-Path $pf86 'LibreOffice\program\soffice.exe') }
  $calon | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

function Ubah-KePdf([string]$masuk, [string]$keluar, [bool]$isExcel) {
  if (-not $isExcel) {
    if (-not $script:word) {
      try {
        $script:word = New-Object -ComObject Word.Application
        $script:word.Visible = $false
        $script:word.DisplayAlerts = 0
        $script:word.AutomationSecurity = 3   # makro dimatikan
      } catch { $script:word = $null }
    }
    if ($script:word) {
      # sandi palsu: surat yang dikunci sandi langsung GAGAL, bukan memunculkan jendela yang menghentikan helper
      $doc = $script:word.Documents.Open($masuk, $false, $true, $false, 'x')
      try { $doc.ExportAsFixedFormat($keluar, 17) } finally { $doc.Close(0) | Out-Null }
      return 'word'
    }
  } else {
    if (-not $script:excel) {
      try {
        $script:excel = New-Object -ComObject Excel.Application
        $script:excel.Visible = $false
        $script:excel.DisplayAlerts = $false
        $script:excel.ScreenUpdating = $false
        $script:excel.AutomationSecurity = 3
      } catch { $script:excel = $null }
    }
    if ($script:excel) {
      $wb = $script:excel.Workbooks.Open($masuk, 0, $true, [Type]::Missing, 'x')
      try {
        foreach ($ws in $wb.Worksheets) {
          if ($ws.Visible -ne -1) { continue }
          if ($script:excel.WorksheetFunction.CountA($ws.UsedRange) -eq 0) { continue }
          try {
            $ps = $ws.PageSetup
            $ps.Zoom = $false; $ps.FitToPagesWide = 1; $ps.FitToPagesTall = $false
            $ps.CenterHorizontally = $true
            if ($ws.UsedRange.Width -gt $ws.UsedRange.Height) { $ps.Orientation = 2 }
          } catch { Tulis ('pengaturan halaman sheet dilewati: ' + $_.Exception.Message) }
        }
        $wb.ExportAsFixedFormat(0, $keluar)
      } finally { $wb.Close($false) | Out-Null }
      return 'excel'
    }
  }
  $soffice = Ambil-Soffice
  if (-not $soffice) { throw 'Microsoft Word/Excel maupun LibreOffice tidak ditemukan di komputer ini' }
  $dir = Split-Path -Parent $keluar
  & $soffice --headless --convert-to pdf --outdir $dir $masuk | Out-Null
  $hasil = Join-Path $dir ([System.IO.Path]::GetFileNameWithoutExtension($masuk) + '.pdf')
  if (-not (Test-Path -LiteralPath $hasil)) { throw 'LibreOffice gagal mengubah file ini' }
  if ($hasil -ne $keluar) { Move-Item -LiteralPath $hasil -Destination $keluar -Force }
  return 'libreoffice'
}

$ascii = [System.Text.Encoding]::ASCII
function Kirim($aliran, [int]$kode, [string]$status, [string]$jenisIsi, [byte[]]$isi, [string]$origin) {
  if ($null -eq $isi) { $isi = New-Object byte[] 0 }
  $h = 'HTTP/1.1 ' + $kode + ' ' + $status + [char]13 + [char]10
  $h += 'Content-Type: ' + $jenisIsi + [char]13 + [char]10
  $h += 'Content-Length: ' + $isi.Length + [char]13 + [char]10
  $h += 'Connection: close' + [char]13 + [char]10
  $h += 'Cache-Control: no-store' + [char]13 + [char]10
  if ($origin -eq $IZIN_ORIGIN) {
    $h += 'Access-Control-Allow-Origin: ' + $IZIN_ORIGIN + [char]13 + [char]10
    $h += 'Access-Control-Allow-Methods: GET, POST, OPTIONS' + [char]13 + [char]10
    $h += 'Access-Control-Allow-Headers: Content-Type, X-Jenis, X-Barcode-Sumaker' + [char]13 + [char]10
    $h += 'Access-Control-Allow-Private-Network: true' + [char]13 + [char]10
    $h += 'Access-Control-Expose-Headers: X-Pengubah' + [char]13 + [char]10
  }
  $h += [char]13 + [char]10
  $kepala = $ascii.GetBytes($h)
  $aliran.Write($kepala, 0, $kepala.Length)
  if ($isi.Length -gt 0) { $aliran.Write($isi, 0, $isi.Length) }
  $aliran.Flush()
}
function KirimTeks($aliran, [int]$kode, [string]$status, [string]$teks, [string]$origin) {
  Kirim $aliran $kode $status 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes($teks)) $origin
}

function Baca-Permintaan($aliran) {
  # baca kepala sampai baris kosong
  $buf = New-Object System.IO.MemoryStream
  $satu = New-Object byte[] 1
  $akhir = 0
  while ($true) {
    $n = $aliran.Read($satu, 0, 1)
    if ($n -le 0) { return $null }
    $buf.WriteByte($satu[0])
    if ($buf.Length -gt 65536) { throw 'kepala permintaan terlalu besar' }
    $b = $buf.GetBuffer(); $L = $buf.Length
    if ($L -ge 4 -and $b[$L - 4] -eq 13 -and $b[$L - 3] -eq 10 -and $b[$L - 2] -eq 13 -and $b[$L - 1] -eq 10) { break }
  }
  $teks = $ascii.GetString($buf.ToArray())
  $baris = $teks -split ([string][char]13 + [char]10)
  $awal = $baris[0] -split ' '
  $kepala = @{}
  foreach ($x in $baris[1..($baris.Length - 1)]) {
    $i = $x.IndexOf(':')
    if ($i -gt 0) { $kepala[$x.Substring(0, $i).Trim().ToLower()] = $x.Substring($i + 1).Trim() }
  }
  [int]$panjang = 0
  if ($kepala.ContainsKey('content-length')) { $panjang = [int]$kepala['content-length'] }
  if ($panjang -gt $MAKS_BYTE) { throw 'file terlalu besar' }
  $isi = New-Object byte[] $panjang
  [int]$dapat = 0
  while ($dapat -lt $panjang) {
    $n = $aliran.Read($isi, $dapat, $panjang - $dapat)
    if ($n -le 0) { throw 'koneksi terputus' }
    $dapat += $n
  }
  return @{ metode = $awal[0]; jalur = $awal[1]; kepala = $kepala; isi = $isi }
}

function Layani($klien) {
  $aliran = $klien.GetStream()
  $aliran.ReadTimeout = 30000
  $origin = ''
  try {
    $req = Baca-Permintaan $aliran
    if ($null -eq $req) { return }
    if ($req.kepala.ContainsKey('origin')) { $origin = $req.kepala['origin'] }
    # hanya halaman SUMAKER (atau plugin Tampermonkey, yang tidak mengirim Origin halaman lain) yang dilayani
    if ($origin -and $origin -ne $IZIN_ORIGIN -and -not $origin.StartsWith('chrome-extension://') -and -not $origin.StartsWith('moz-extension://')) {
      KirimTeks $aliran 403 'Forbidden' 'ditolak' ''
      return
    }
    if ($req.metode -eq 'OPTIONS') { Kirim $aliran 204 'No Content' 'text/plain' $null $origin; return }
    if ($req.metode -eq 'GET' -and $req.jalur -eq '/ping') { KirimTeks $aliran 200 'OK' ('helper-barcode-sumaker ' + $VERSI) $origin; return }
    if ($req.metode -eq 'POST' -and $req.jalur -eq '/ubah') {
      if (-not $req.kepala.ContainsKey('x-barcode-sumaker')) { KirimTeks $aliran 403 'Forbidden' 'ditolak' $origin; return }
      $jenis = ''
      if ($req.kepala.ContainsKey('x-jenis')) { $jenis = $req.kepala['x-jenis'].ToLower() }
      if (@('docx', 'doc', 'xlsx', 'xls') -notcontains $jenis) { KirimTeks $aliran 400 'Bad Request' 'jenis file tidak didukung' $origin; return }
      $id = [guid]::NewGuid().ToString('N')
      $masuk = Join-Path $kerja ($id + '.' + $jenis)
      $keluar = Join-Path $kerja ($id + '.pdf')
      [System.IO.File]::WriteAllBytes($masuk, $req.isi)
      try {
        try {
          $pengubah = Ubah-KePdf $masuk $keluar ($jenis -like 'xls*')
        } catch {
          # Word/Excel bisa macet atau tertutup sendiri: buka yang baru lalu coba sekali lagi
          Tulis ('coba ulang: ' + $_.Exception.Message)
          Tutup-Office
          Remove-Item -LiteralPath $keluar -Force -ErrorAction SilentlyContinue
          $pengubah = Ubah-KePdf $masuk $keluar ($jenis -like 'xls*')
        }
        $pdf = [System.IO.File]::ReadAllBytes($keluar)
        Tulis ('OK ' + $jenis + ' ' + $req.isi.Length + ' byte -> ' + $pdf.Length + ' byte (' + $pengubah + ')')
        Kirim $aliran 200 'OK' 'application/pdf' $pdf $origin
      } finally {
        Remove-Item -LiteralPath $masuk -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $keluar -Force -ErrorAction SilentlyContinue
      }
      $script:terakhir = Get-Date
      return
    }
    KirimTeks $aliran 404 'Not Found' 'tidak ada' $origin
  } catch {
    Tulis ('GAGAL: ' + $_.Exception.Message)
    try { KirimTeks $aliran 500 'Error' $_.Exception.Message $origin } catch {}
  } finally {
    try { $aliran.Close() } catch {}
    try { $klien.Close() } catch {}
  }
}

# satu helper saja per komputer
$pendengar = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback), $PORT
try { $pendengar.Start() } catch { Tulis 'helper sudah berjalan (port terpakai); keluar.'; exit 0 }
Tulis ('helper berjalan di 127.0.0.1:' + $PORT)
# Browser kadang membuka koneksi cadangan yang tidak pernah dipakai. Koneksi baru ditampung dulu dan baru
# dilayani setelah datanya datang, supaya koneksi kosong tidak membuat helper macet.
$antre = New-Object System.Collections.ArrayList
try {
  while ($true) {
    $ada = $false
    while ($pendengar.Pending()) { [void]$antre.Add(@{ klien = $pendengar.AcceptTcpClient(); sejak = Get-Date }); $ada = $true }
    foreach ($x in @($antre)) {
      $k = $x.klien
      $siap = $false; $tutup = $false
      try {
        if ($k.Available -gt 0) { $siap = $true }
        elseif ($k.Client.Poll(0, [System.Net.Sockets.SelectMode]::SelectRead)) { $tutup = $true }   # ditutup tanpa data
        elseif (((Get-Date) - $x.sejak).TotalSeconds -gt 30) { $tutup = $true }
      } catch { $tutup = $true }
      if ($siap) { $antre.Remove($x); Layani $k; $ada = $true }
      elseif ($tutup) { $antre.Remove($x); try { $k.Close() } catch {} }
    }
    if (-not $ada) {
      Start-Sleep -Milliseconds 50
      if (($script:word -or $script:excel) -and ((Get-Date) - $script:terakhir).TotalSeconds -gt $DIAM_DETIK) { Tutup-Office }
    }
  }
} finally {
  foreach ($x in @($antre)) { try { $x.klien.Close() } catch {} }
  Tutup-Office
  $pendengar.Stop()
}
