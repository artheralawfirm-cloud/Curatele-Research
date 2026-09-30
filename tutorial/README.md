# Narasi Tutorial Dokumen Penyumpahan (Gemini TTS)

Membuat ulang narasi video tutorial dengan Gemini TTS (penutur native Indonesia).

- `narasi.json`: naskah per langkah, waktu tiap segmen di video asli, suara, dan gaya bicara.
- `tts.py`: men-generate seluruh naskah dalam satu permintaan (suara konsisten, hemat kuota), lalu memotongnya per langkah.
- `build.py`: merakit video. Setiap narasi mulai saat kartu langkahnya muncul. Jika narasi lebih panjang dari segmennya, frame terakhir ditahan. Ditambah musik latar lembut yang otomatis mengecil saat ada suara.

```bash
pip install google-genai numpy
# GEMINI_API_KEY diambil dari env atau .env.local (jangan di-commit)
python3 tutorial/tts.py out/tts
python3 tutorial/build.py video_asli.mp4 out/tts out/tutorial_narasi_gemini.mp4   # --no-music untuk suara saja
```

Untuk mengganti kalimat, edit `narasi.json`, hapus `out/tts/narasi_full.wav`, lalu jalankan ulang kedua perintah.
