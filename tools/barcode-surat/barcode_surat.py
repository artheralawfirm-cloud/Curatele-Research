#!/usr/bin/env python3
"""Barcode Surat Massal — tempel QR/barcode, logo gembok, TTD, dan footer ke banyak PDF sekaligus.

Pemakaian:
    python barcode_surat.py --input surat_masuk/ --output surat_jadi/ [--config config.json]

Nomor surat diambil dari nama file (mis. "W13.U1-123-HK.01-X-2026.pdf") atau dari daftar.csv
(kolom: file,nomor,perihal) supaya tidak tertukar.
"""
import argparse, csv, hashlib, io, json, sys, time
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime
from pathlib import Path

import pymupdf as fitz
import qrcode
from PIL import Image, ImageDraw

DEFAULT_CONFIG = {
    "halaman": "terakhir",              # "terakhir", "pertama", atau "semua"
    "qr_isi": "Nomor: {nomor}\nPerihal: {perihal}\nTanggal: {tanggal}\nKode: {kode}",
    "qr_ukuran_mm": 25,
    "posisi": {"kanan_mm": 20, "bawah_mm": 40},  # sudut kanan-bawah blok TTD
    "logo_gembok": "",                   # path PNG; kosong = gembok bawaan
    "ttd": "",                           # path PNG tanda tangan (transparan); kosong = tidak dipasang
    "nama_penandatangan": "",
    "footer": "Salinan untuk arsip internal. Bukan dokumen bertanda tangan elektronik BSrE.",
    "footer_ukuran_font": 7,
}
MM = 72 / 25.4


def gembok_bawaan(px=200):
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    w = px // 12
    d.arc([px * .28, px * .08, px * .72, px * .58], 180, 360, fill=(30, 30, 30, 255), width=w)
    d.line([px * .28 + w / 2, px * .33, px * .28 + w / 2, px * .48], fill=(30, 30, 30, 255), width=w)
    d.line([px * .72 - w / 2, px * .33, px * .72 - w / 2, px * .48], fill=(30, 30, 30, 255), width=w)
    d.rounded_rectangle([px * .18, px * .45, px * .82, px * .95], radius=px // 14, fill=(200, 150, 20, 255))
    d.ellipse([px * .44, px * .6, px * .56, px * .72], fill=(30, 30, 30, 255))
    d.rectangle([px * .48, px * .68, px * .52, px * .82], fill=(30, 30, 30, 255))
    return png_bytes(img)


def png_bytes(img):
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def buat_qr(teks, logo_png):
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=10, border=1)
    qr.add_data(teks)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
    # logo gembok di tengah QR (aman karena koreksi error level H)
    logo = Image.open(io.BytesIO(logo_png)).convert("RGBA")
    s = img.size[0] // 4
    logo = logo.resize((s, s))
    bg = Image.new("RGBA", (s + 12, s + 12), "white")
    pos = ((img.size[0] - bg.size[0]) // 2,) * 2
    img.paste(bg, pos)
    img.paste(logo, (pos[0] + 6, pos[1] + 6), logo)
    return png_bytes(img)


def proses_satu(args):
    src, dst, meta, cfg = args
    t0 = time.time()
    try:
        doc = fitz.open(src)
        if doc.page_count == 0:
            raise ValueError("PDF kosong")
        data = Path(src).read_bytes()
        kode = hashlib.sha256(data).hexdigest()[:12].upper()
        isi = cfg["qr_isi"].format(nomor=meta["nomor"], perihal=meta.get("perihal", "-"),
                                   tanggal=datetime.now().strftime("%d-%m-%Y"), kode=kode)
        logo = Path(cfg["logo_gembok"]).read_bytes() if cfg["logo_gembok"] else gembok_bawaan()
        qr_png = buat_qr(isi, logo)
        ttd_png = Path(cfg["ttd"]).read_bytes() if cfg["ttd"] else None

        h = cfg["halaman"]
        pages = range(doc.page_count) if h == "semua" else [0 if h == "pertama" else doc.page_count - 1]
        q = cfg["qr_ukuran_mm"] * MM
        for i in pages:
            pg = doc[i]
            W, H = pg.rect.width, pg.rect.height
            x1 = W - cfg["posisi"]["kanan_mm"] * MM
            y1 = H - cfg["posisi"]["bawah_mm"] * MM
            qr_rect = fitz.Rect(x1 - q, y1 - q, x1, y1)
            pg.insert_image(qr_rect, stream=qr_png)
            if ttd_png:
                pg.insert_image(fitz.Rect(x1 - 2.2 * q, y1 - q, x1 - q - 4, y1), stream=ttd_png, keep_proportion=True)
            if cfg["nama_penandatangan"]:
                pg.insert_textbox(fitz.Rect(x1 - 2.4 * q, y1 + 2, x1, y1 + 14), cfg["nama_penandatangan"],
                                  fontsize=8, fontname="hebo", align=fitz.TEXT_ALIGN_RIGHT)
            pg.insert_image(fitz.Rect(15 * MM, H - 13 * MM, 15 * MM + 8, H - 13 * MM + 8), stream=logo)
            pg.insert_textbox(fitz.Rect(15 * MM + 11, H - 13 * MM - 1, W - 15 * MM, H - 5 * MM),
                              f"{cfg['footer']}  [{meta['nomor']} | {kode}]",
                              fontsize=cfg["footer_ukuran_font"], fontname="helv", color=(0.25, 0.25, 0.25))
        Path(dst).parent.mkdir(parents=True, exist_ok=True)
        doc.save(dst, garbage=3, deflate=True)
        return {"file": Path(src).name, "nomor": meta["nomor"], "kode": kode, "status": "OK",
                "keterangan": "", "detik": round(time.time() - t0, 2)}
    except Exception as e:
        return {"file": Path(src).name, "nomor": meta.get("nomor", ""), "kode": "", "status": "GAGAL",
                "keterangan": str(e), "detik": round(time.time() - t0, 2)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", required=True, help="folder berisi PDF surat")
    ap.add_argument("--output", required=True, help="folder hasil")
    ap.add_argument("--config", help="config.json (opsional)")
    ap.add_argument("--daftar", help="CSV file,nomor,perihal (opsional; default nomor = nama file)")
    a = ap.parse_args()

    cfg = dict(DEFAULT_CONFIG)
    if a.config:
        cfg.update(json.loads(Path(a.config).read_text(encoding="utf-8")))

    pdfs = sorted(Path(a.input).glob("*.pdf")) + sorted(Path(a.input).glob("*.PDF"))
    if not pdfs:
        sys.exit(f"Tidak ada PDF di {a.input}")
    daftar = {}
    if a.daftar:
        with open(a.daftar, newline="", encoding="utf-8-sig") as f:
            daftar = {r["file"]: r for r in csv.DictReader(f)}
        hilang = [p.name for p in pdfs if p.name not in daftar]
        if hilang:
            sys.exit("File tidak ada di daftar CSV (dibatalkan agar tidak tertukar):\n  " + "\n  ".join(hilang))

    out = Path(a.output)
    jobs = [(str(p), str(out / p.name), daftar.get(p.name, {"nomor": p.stem}), cfg) for p in pdfs]
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
