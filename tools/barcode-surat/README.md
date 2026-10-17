# Barcode Surat Massal

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
aset/gembok.jpg              <- gembok (sama untuk semua surat)
aset/footer.jpg              <- footer (sama untuk semua surat)
```
Nama subfolder di `aset/` harus sama dengan nama file PDF (tanpa `.pdf`). Kalau ada surat yang punya
gembok/footer sendiri, taruh `gembok.*` / `footer.*` di subfolder surat itu. Format boleh png/jpg.

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
Unduh aset dan unggah ulang ke SUMAKER masih manual. Setelah ada rekaman layar prosesnya, langkah itu
bisa diotomatisasi lewat plugin browser.
