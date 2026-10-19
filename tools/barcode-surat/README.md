# Barcode Surat Massal

## Cara tercepat: plugin browser langsung di SUMAKER

`sumaker-barcode.user.js` berjalan di halaman **Tanda Tangan Elektronik**
(`sumaker.kemenkum.go.id/main/dse`). Untuk setiap baris surat, plugin mengambil tautan
**Surat, QRCode, Logo SE, Footer** milik baris itu sendiri, menempelkannya, lalu mengunduh satu ZIP.

**Pasang (sekali saja)** — panduan bergambar: [`tutorial-pasang-plugin.jpg`](tutorial-pasang-plugin.jpg)
1. Pasang ekstensi **Tampermonkey** di Chrome/Edge.
2. Buka Tampermonkey → *Create a new script*, hapus isinya, tempel seluruh isi `sumaker-barcode.user.js`, simpan.
3. Buka halaman Tanda Tangan Elektronik di SUMAKER. Kotak kuning **Barcode Massal** muncul di kanan bawah, dan kotak centang muncul di kolom NO.

**Pakai**
1. Atur *Show entries* supaya surat yang mau dibarcode tampil di halaman.
2. Pilih suratnya lewat kotak centang di kolom **NO** (satu, beberapa, atau semua lewat kotak di judul kolom NO).
3. Klik **Barcode surat terpilih (N)**. Plugin melihat jenis berkas tiap surat:
   - **Word (.docx/.doc) dan Excel (.xlsx/.xls)** — jalur utama. Terunduh `surat-word-excel-<tanggal>.zip` berisi
     folder `surat-asli`, `UBAH-KE-PDF.bat`, `ubah-ke-pdf.ps1`, `BACA-SAYA.txt`.
     1. Ekstrak ZIP, klik dua kali **UBAH-KE-PDF.bat**. Microsoft Word/Excel di komputer itu mengubah semua surat
        ke PDF (folder `pdf-hasil`), tampilannya persis seperti dibuka di Word/Excel. Sheet Excel diatur pas satu
        lebar halaman (mendatar bila tabelnya lebar) supaya rapi. Tanpa Microsoft Office, LibreOffice dipakai bila ada.
     2. Kembali ke SUMAKER, klik **Lanjut: tempel ke PDF**, pilih **semua** PDF di folder `pdf-hasil`.
        Kode `[#xxxxxxxx]` di nama file mencocokkan tiap PDF dengan barisnya sendiri — **jangan ubah nama file**.
   - **PDF** — langsung dibarcode.
4. Hasil akhir: `surat-barcode-<tanggal>.zip` berisi satu PDF per surat (**nama file = Perihal Surat**) dan `laporan.csv`.
5. Unggah tiap PDF lewat **Kirim Surat** di baris yang perihalnya sama.

**Pengaman**
- QR, gembok dan footer diambil dari baris yang sama dengan suratnya. QR identik di dua baris,
  atau ada tautan/berkas yang gagal diambil → **seluruh proses dibatalkan** sebelum ada surat yang diproses.
- QR + gembok ditempel di **setiap halaman yang punya baris jabatan** "Kepala," (juga "Plt./Plh. Kepala,",
  "a.n. Kepala …,"), tepat di bawah baris itu — sama seperti surat hasil SUMAKER (surat tugas + lampiran).
  Halaman tambahan bertanda tangan basah (mis. SPPD "Pejabat Pembuat Komitmen") tidak diberi QR/gembok.
- Footer ditempel di bagian bawah **semua halaman** dokumen (8 halaman → 8 footer).
- **Tidak pernah menimpa tulisan**: kalau QR/gembok/footer akan mengenai teks apa pun (mis. nama terlalu dekat
  dengan "Kepala,"), surat itu GAGAL dengan alasan jelas — tidak ditempel asal.
- Kalau ruang antara "Kepala," dan nama sempit (mis. tabel Excel yang dikecilkan), QR + gembok **diperkecil
  secukupnya** (paling kecil 50%) supaya pas; dicatat di `laporan.csv`. Lebih sempit lagi → GAGAL.
- Kalau blok tanda tangan terlalu dekat ke footer, **isi halaman itu diperkecil seragam** (paling kecil 92%)
  supaya muat; dicatat di `laporan.csv`. Lebih dari itu → GAGAL, rapikan manual.
- Hanya menempel di halaman yang sudah ada: **tidak pernah menambah halaman** (dicek tiap surat).
- Gembok & footer JPG dari SUMAKER otomatis dibuat transparan (tidak ada kotak abu-abu).
- Semua proses terjadi di browser Anda sendiri; tidak ada data yang dikirim ke luar SUMAKER.
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
