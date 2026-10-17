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

## PENTING: ini bukan tanda tangan elektronik BSrE
QR, gembok, dan footer resmi pada surat SUMAKER ("ditandatangani secara elektronik menggunakan sertifikat
elektronik yang diterbitkan oleh BSrE, BSSN") muncul karena PDF benar-benar ditandatangani secara digital
dengan sertifikat BSrE. Menempelkan gambar QR/gembok/footer yang sama ke PDF **tidak** membuat surat itu sah,
dan surat seperti itu akan gagal diverifikasi di https://bsre.bssn.go.id/pdf-verification.
Karena itu alat ini sengaja **tidak** meniru footer/gembok BSrE. Pakai hanya untuk penanda/arsip internal.
Untuk TTE massal yang sah, otomatisasinya harus menjalankan tombol TTE di SUMAKER (lihat di bawah).

## Keterbatasan
Belum terhubung langsung ke SUMAKER (akses server ada di admin pusat). Setelah ada rekaman layar
proses barcode 1 surat, langkah unduh/unggah bisa diotomatisasi lewat userscript browser.
