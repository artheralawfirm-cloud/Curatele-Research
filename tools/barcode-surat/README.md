# Barcode Surat Massal

## Cara tercepat: plugin browser langsung di SUMAKER

`sumaker-barcode.user.js` berjalan di halaman **Tanda Tangan Elektronik**
(`sumaker.kemenkum.go.id/main/dse`). Untuk setiap baris surat, plugin mengambil tautan
**Surat, QRCode, Logo SE, Footer** milik baris itu sendiri, menempelkannya, lalu mengunduh satu ZIP.

**Pasang (sekali saja per komputer)** — panduan bergambar: [`tutorial-pasang-plugin.jpg`](tutorial-pasang-plugin.jpg)
1. Pasang ekstensi **Tampermonkey** di Chrome/Edge/Firefox. Di Chrome/Edge versi baru, nyalakan juga
   **Allow User Scripts** (Kelola ekstensi → Tampermonkey → Detail) atau **Developer mode**.
2. Buka Tampermonkey → *Create a new script*, hapus isinya, tempel seluruh isi `sumaker-barcode.user.js`, simpan.
3. Buka halaman Tanda Tangan Elektronik di SUMAKER. Kotak kuning **Barcode Massal** muncul di kanan bawah,
   dan kotak centang muncul di kolom NO.
4. **Pasang helper Word/Excel**: di kotak biru, klik **Pasang helper (sekali saja)** → ekstrak ZIP yang terunduh →
   klik dua kali **PASANG-HELPER** → tunggu tulisan **BERHASIL**. Kotak biru berubah jadi ✔ hijau.
   Helper menyala sendiri setiap komputer dinyalakan. Tidak perlu hak admin.

**Pakai (setiap hari)**
1. Atur *Show entries* supaya surat yang mau dibarcode tampil di halaman.
2. Centang suratnya di kolom **NO** (satu, beberapa, atau semua lewat kotak di judul kolom NO).
3. Klik tombol kuning **Barcode surat terpilih (N)**. Selesai: `surat-barcode-<tanggal>.zip` terunduh, berisi satu
   **PDF final** per surat (**nama file = Perihal Surat**) dan `laporan.csv`.
   - Word (.docx/.doc) dan Excel (.xlsx/.xls) diubah ke PDF oleh **Microsoft Word/Excel di komputer itu** lewat helper,
     jadi tampilannya persis seperti dibuka di Word/Excel. Sheet Excel diatur pas satu lebar halaman (mendatar bila
     tabelnya lebar). Tanpa Microsoft Office, LibreOffice dipakai bila ada.
   - PDF langsung dibarcode.
   - Surat yang gagal diubah (mis. file rusak atau dikunci sandi) ditandai GAGAL di `laporan.csv`; surat lain tetap jadi.
4. Unggah tiap PDF lewat **Kirim Surat** di baris yang perihalnya sama.

**Surat dengan lampiran terpisah** (tombol *FILE LAMPIRAN* di SUMAKER) otomatis ikut digabung di belakang surat:
- Lampiran **Word/Excel** (bagian dari surat): diubah ke PDF, diberi footer di setiap halaman, dan QR + gembok
  di halaman yang punya "Kepala,".
- Lampiran **PDF/JPG/PNG** (berkas pribadi: SK CPNS, SK PNS, SKP, …): digabung apa adanya, **tanpa** footer/TTE/barcode.
- Lampiran PDF yang terkunci sandi tidak bisa digabung: surat tetap jadi, lampirannya ada di ZIP sebagai
  `<perihal> - LAMPIRAN.pdf` untuk diunggah terpisah. Semua tercatat di kolom `lampiran` pada `laporan.csv`.

**Helper Word/Excel** (`helper/`)
- Berjalan tersembunyi dan hanya bisa dihubungi dari komputer itu sendiri (`127.0.0.1:48653`), hanya untuk halaman
  SUMAKER. Surat tidak dikirim ke mana pun; berkas sementara langsung dihapus. Makro di dokumen tidak dijalankan.
- Cocok untuk Windows 7, 8, 10, 11 (PowerShell 2.0 ke atas), Office 2010 ke atas (32/64-bit), tanpa hak admin.
- Menghapus: klik dua kali **HAPUS-HELPER** dari ZIP pemasang yang sama.
- Belum terpasang / bukan Windows? Surat Word/Excel tetap bisa lewat cara cadangan: plugin mengunduh
  `surat-word-excel-<tanggal>.zip` → ekstrak → klik dua kali **UBAH-KE-PDF** → klik tombol hijau, pilih semua PDF di
  folder `pdf-hasil` (kode `[#xxxxxxxx]` di nama file mencocokkan tiap PDF dengan barisnya — jangan ubah nama file).
- Komputer kantor yang PowerShell-nya dikunci oleh IT (AppLocker/Constrained Language) tidak bisa menjalankan helper;
  minta IT mengizinkan `%LOCALAPPDATA%\BarcodeSumaker\helper-barcode.ps1`, atau pakai cara cadangan.
- Setelah mengubah berkas di `helper/`, jalankan `python helper/bangun.py` supaya isinya ikut tertanam di plugin.

**Pengaman**
- QR, gembok dan footer diambil dari baris yang sama dengan suratnya. QR identik di dua baris,
  atau ada tautan/berkas yang gagal diambil → **seluruh proses dibatalkan** sebelum ada surat yang diproses.
- QR + gembok ditempel di **setiap halaman yang punya baris jabatan** "Kepala," (juga "Plt./Plh. Kepala,",
  "a.n. Kepala …,"), tepat di bawah baris itu — sama seperti surat hasil SUMAKER (surat tugas + lampiran).
  Halaman tambahan bertanda tangan basah (mis. SPPD "Pejabat Pembuat Komitmen") tidak diberi QR/gembok.
- Footer ditempel di bagian bawah **semua halaman** dokumen (8 halaman → 8 footer).
- **Tidak pernah menimpa tulisan**: kalau QR/gembok/footer akan mengenai teks apa pun (mis. nama terlalu dekat
  dengan "Kepala,"), surat itu GAGAL dengan alasan jelas — tidak ditempel asal.
- QR + gembok **selalu ukuran penuh**, seperti surat hasil SUMAKER. Kalau ruang antara "Kepala," dan nama kurang:
  - surat/lampiran **Word (.docx)**: ruangnya **ditambah langsung di Word** (paragraf kosong setinggi kekurangannya
    disisipkan di bawah "Kepala,", lalu diubah ke PDF lagi), jadi tampilannya seperti surat biasa — garis tabel,
    kaki halaman dan tautan tetap utuh. Dipakai hanya bila jumlah halaman dan letak tanda tangan tidak berubah;
  - selain itu (surat PDF, atau cara di Word tidak berhasil): **nama (dan semua yang di bawahnya) digeser turun** di
    PDF. Garis tabel yang tegak disambung; kaki halaman Word (nomor halaman, garis, gambar) tetap di tempat.
  Semua dicatat di `laporan.csv`.
- Ruang tanda tangan **tidak dibuat-buat**: kalau di bawah "Kepala," tidak ada satu baris kosong pun (jabatan dua
  baris, atau baris isi surat yang mirip jabatan), ada cap/gambar/garis melintang di ruang itu, atau tulisan di
  sampingnya (mis. daftar Tembusan) akan terbelah → GAGAL, tempel manual.
- Kalau blok tanda tangan (atau nama yang digeser) jadi terlalu dekat ke footer, **isi halaman itu diperkecil
  seragam** (paling kecil 92%) supaya muat; dicatat di `laporan.csv`. Lebih dari itu → GAGAL, rapikan manual.
- Hanya menempel di halaman yang sudah ada: **tidak pernah menambah halaman** (dicek tiap surat).
- Gembok & footer JPG dari SUMAKER otomatis dibuat transparan (tidak ada kotak abu-abu).
- Semua proses terjadi di komputer Anda sendiri (browser + helper); tidak ada data yang dikirim ke luar SUMAKER.
- Kalau ada yang tidak jalan, klik **Cek tautan** dan kirim isi kotaknya ke pembuat skrip.

## Alternatif: program Python (berkas sudah diunduh manual)

Menempelkan **QR, gembok BSrE, dan footer hasil unduhan SUMAKER** ke banyak surat PDF sekaligus,
di posisi yang sama dengan surat tugas BHP Medan (QR di kiri, gembok di bawah "Kepala,", footer di bawah halaman).
Uji coba: 80 surat selesai dalam < 1 detik.

Alat ini **tidak membuat** QR/gembok/footer sendiri. Semuanya harus file asli dari SUMAKER untuk surat
yang bersangkutan, supaya QR tetap bisa diverifikasi.

## Instalasi (sekali saja)
```
pip install -r requirements.txt
```

## Siapkan folder
```
surat/3279.pdf               <- PDF surat yang sudah disetujui
surat/3280.pdf
aset/3279/qr.jpg             <- QR milik surat 3279 (unduhan SUMAKER)
aset/3280/qr.jpg
```
Nama subfolder di `aset/` harus sama dengan nama file PDF (tanpa `.pdf`). Cukup QR saja: gembok dan footer
(sama untuk semua surat) sudah tersedia sebagai PNG transparan di `aset_bawaan/`, jadi tidak ada lagi kotak
latar abu-abu di surat. Kalau suatu saat gembok/footer dari SUMAKER berubah, taruh file baru di
`aset/gembok.*` / `aset/footer.*` (dipakai menggantikan bawaan), atau perbarui bawaannya:
```
python rapikan_aset.py gembok.jpg footer.jpg --output aset_bawaan
```

## Jalankan
```
python barcode_surat.py --surat surat --aset aset --output surat_jadi
```
Hasil ada di `surat_jadi/`, ditambah `laporan.csv` (status OK/GAGAL per surat dan halaman tempat TTD).

## Pengaman supaya tidak salah/tertukar
- Surat yang tidak punya QR, atau dua surat yang QR-nya identik → **seluruh proses dibatalkan** sebelum
  ada file yang diubah, dengan daftar surat yang bermasalah.
- Posisi QR dan gembok dicari dari teks "Kepala," (atau "Plt. Kepala,", "Plh. Kepala,",
  "Pejabat Pembuat Komitmen") yang terakhir di surat. Kalau teks itu tidak ada, surat ditandai GAGAL,
  tidak ditebak posisinya.
- File asli di `surat/` tidak pernah diubah.

## Mengatur posisi
Salin `config.contoh.json` → `config.json`, ubah angkanya (satuan point; A4 lebar ±595), lalu tambahkan
`--config config.json`. Contoh: teks jangkar lain, ukuran QR, footer hanya di halaman TTD (`"halaman": "ttd"`).

## Belum
Unggah ulang lewat "Kirim Surat" masih manual (formnya belum diketahui).
