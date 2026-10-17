#!/usr/bin/env python3
"""Barcode Surat Massal — tempel QR, gembok BSrE, dan footer hasil unduhan SUMAKER ke banyak PDF sekaligus.

Struktur folder:
    surat/            PDF surat, mis. 3279.pdf, 3280.pdf
    aset/3279/        qr.png, gembok.png, footer.png  (hasil unduhan SUMAKER untuk surat 3279)
    aset/3280/        ...
    aset/gembok.png   (opsional) dipakai semua surat jika folder surat tidak punya gembok sendiri
    aset/footer.png   (opsional) idem untuk footer

QR wajib ada per surat dan tidak boleh sama antar-surat, supaya QR tidak mungkin tertukar.

Pemakaian:
    python barcode_surat.py --surat surat/ --aset aset/ --output surat_jadi/ [--config config.json]
"""
import argparse, csv, hashlib, json, sys, time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import pymupdf

# Posisi diukur dari contoh surat tugas BHP Medan (satuan point, 1 pt = 1/72 inci).
DEFAULT_CONFIG = {
    "jangkar": ["Kepala,", "Plt. Kepala,", "Plh. Kepala,", "Pejabat Pembuat Komitmen"],
    "jarak_bawah_jangkar": 2,
    "qr": {"x": 87, "lebar": 71},
    "gembok": {"lebar": 51, "tinggi": 70},
    "footer": {"x": 85, "lebar": 468, "tinggi": 21, "jarak_bawah": 36, "halaman": "semua"},
}
EKSTENSI = (".png", ".jpg", ".jpeg")


def cari_aset(folder, nama):
    for ext in EKSTENSI:
        p = folder / f"{nama}{ext}"
        if p.exists():
            return p
    return None


def cari_jangkar(doc, daftar):
    """Kemunculan terakhir teks jangkar (blok TTD) di dokumen: (nomor halaman, Rect)."""
    for i in range(doc.page_count - 1, -1, -1):
        for teks in daftar:
            hits = doc[i].search_for(teks)
            if hits:
                return i, max(hits, key=lambda r: r.y0)
    return None, None


def proses_satu(args):
    src, dst, aset, cfg = args
    t0 = time.time()
    hasil = {"file": Path(src).name, "halaman_ttd": "", "status": "GAGAL", "keterangan": ""}
    try:
        doc = pymupdf.open(src)
        i, r = cari_jangkar(doc, cfg["jangkar"])
        if i is None:
            raise ValueError(f"teks jangkar {cfg['jangkar']} tidak ditemukan; posisi TTD tidak bisa ditentukan")
        pg = doc[i]
        y = r.y1 + cfg["jarak_bawah_jangkar"]
        q, g = cfg["qr"], cfg["gembok"]
        pg.insert_image(pymupdf.Rect(q["x"], y, q["x"] + q["lebar"], y + q["lebar"]), filename=aset["qr"])
        pg.insert_image(pymupdf.Rect(r.x0, y, r.x0 + g["lebar"], y + g["tinggi"]), filename=aset["gembok"], keep_proportion=True)

        f = cfg["footer"]
        pages = range(doc.page_count) if f["halaman"] == "semua" else [i]
        for n in pages:
            H = doc[n].rect.height
            doc[n].insert_image(pymupdf.Rect(f["x"], H - f["jarak_bawah"] - f["tinggi"],
                                             f["x"] + f["lebar"], H - f["jarak_bawah"]), filename=aset["footer"], keep_proportion=True)
        Path(dst).parent.mkdir(parents=True, exist_ok=True)
        doc.save(dst, garbage=3, deflate=True)
        hasil.update(halaman_ttd=i + 1, status="OK")
    except Exception as e:
        hasil["keterangan"] = str(e)
    hasil["detik"] = round(time.time() - t0, 2)
    return hasil


def siapkan(surat_dir, aset_dir):
    """Pasangkan tiap PDF dengan asetnya. Semua masalah dikumpulkan; satu saja masalah = batal semua."""
    pdfs = sorted(p for p in surat_dir.iterdir() if p.suffix.lower() == ".pdf")
    if not pdfs:
        sys.exit(f"Tidak ada PDF di {surat_dir}")
    umum = {k: cari_aset(aset_dir, k) for k in ("gembok", "footer")}
    pasangan, masalah, qr_hash = {}, [], {}
    for p in pdfs:
        d = aset_dir / p.stem
        a = {k: cari_aset(d, k) if d.is_dir() else None for k in ("qr", "gembok", "footer")}
        a["gembok"] = a["gembok"] or umum["gembok"]
        a["footer"] = a["footer"] or umum["footer"]
        kurang = [k for k, v in a.items() if v is None]
        if kurang:
            masalah.append(f"{p.name}: tidak ada {', '.join(kurang)} di {d}/")
            continue
        h = hashlib.sha256(a["qr"].read_bytes()).hexdigest()
        if h in qr_hash:
            masalah.append(f"{p.name}: QR sama persis dengan milik {qr_hash[h]} (kemungkinan tertukar)")
        qr_hash[h] = p.name
        pasangan[p] = {k: str(v) for k, v in a.items()}
    return pasangan, masalah


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--surat", required=True, help="folder PDF surat")
    ap.add_argument("--aset", required=True, help="folder aset hasil unduhan SUMAKER")
    ap.add_argument("--output", required=True, help="folder hasil")
    ap.add_argument("--config", help="config.json (opsional) untuk mengubah posisi")
    a = ap.parse_args()

    cfg = json.loads(json.dumps(DEFAULT_CONFIG))
    if a.config:
        for k, v in json.loads(Path(a.config).read_text(encoding="utf-8")).items():
            cfg[k] = {**cfg[k], **v} if isinstance(v, dict) else v

    pasangan, masalah = siapkan(Path(a.surat), Path(a.aset))
    if masalah:
        sys.exit("Dibatalkan, tidak ada surat yang diproses:\n  " + "\n  ".join(masalah))

    out = Path(a.output)
    jobs = [(str(p), str(out / p.name), aset, cfg) for p, aset in pasangan.items()]
    t0 = time.time()
    with ProcessPoolExecutor() as ex:
        hasil = list(ex.map(proses_satu, jobs))

    out.mkdir(parents=True, exist_ok=True)
    with open(out / "laporan.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=hasil[0].keys())
        w.writeheader()
        w.writerows(hasil)
    ok = sum(r["status"] == "OK" for r in hasil)
    print(f"Selesai: {ok}/{len(hasil)} surat dalam {time.time() - t0:.1f} detik. Laporan: {out / 'laporan.csv'}")
    for r in hasil:
        if r["status"] != "OK":
            print(f"  GAGAL {r['file']}: {r['keterangan']}")


if __name__ == "__main__":
    main()
