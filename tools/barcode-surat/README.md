# Barcode Surat Massal

Alat ringan untuk membubuhkan **QR code/barcode + logo gembok + TTD + footer** ke banyak surat PDF sekaligus
(contoh: 80 surat selesai ±1,5 detik).

## Instalasi (sekali saja)
```
pip install -r requirements.txt
```

## Pakai
1. Unduh semua PDF surat dari SUMAKER ke satu folder, mis. `surat_masuk/`.
2. (Opsional) salin `config.contoh.json` → `config.json`, isi path `ttd` (PNG transparan), `logo_gembok`,
   `nama_penandatangan`, teks `footer`, dan posisi QR.
3. Jalankan:
   ```
   python barcode_surat.py --input surat_masuk --output surat_jadi --config config.json
   ```
4. Unggah file di `surat_jadi/` kembali ke SUMAKER. Cek `surat_jadi/laporan.csv` (status OK/GAGAL per surat).

## Mencegah salah/tertukar
- Nomor surat di QR diambil dari **nama file**, jadi QR selalu melekat pada file yang benar.
- Atau pakai `--daftar daftar.csv` (kolom `file,nomor,perihal`). Jika ada PDF yang tidak tercantum,
  proses **dibatalkan seluruhnya** supaya tidak ada yang tertukar.
- Setiap surat mendapat kode unik (hash isi PDF) di QR dan footer.

## Keterbatasan
Belum terhubung langsung ke SUMAKER (akses server ada di admin pusat). Setelah ada rekaman layar
proses barcode 1 surat, langkah unduh/unggah bisa diotomatisasi lewat userscript browser.
