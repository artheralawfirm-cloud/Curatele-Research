#!/usr/bin/env python3
"""Ubah gembok & footer JPG dari SUMAKER menjadi PNG berlatar transparan.

    python rapikan_aset.py gembok.jpg footer.jpg --output aset_bawaan/

- Gembok: hanya latar di LUAR garis gembok yang dibuat transparan (isi gembok tetap utuh).
- Footer: latar putih dibuat transparan, tulisan tetap tajam.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

PENANDA = (255, 0, 255)


def rapikan_gembok(src):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    isi = im.copy()
    # flood fill dari keempat sudut; batas warna 40 menahan isian di garis luar gembok yang gelap
    # plus lubang di tengah lengkung gembok, yang tertutup garis sehingga tidak terjangkau dari sudut
    for p in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, h // 4)]:
        ImageDraw.floodfill(isi, p, PENANDA, thresh=40)
    alpha = Image.new("L", (w, h), 255)
    px, pa = isi.load(), alpha.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] == PENANDA:
                pa[x, y] = 0
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))  # haluskan tepi
    out = im.convert("RGBA")
    out.putalpha(alpha)
    out = out.crop(out.getbbox())
    # 600 px tinggi sudah ±600 dpi pada ukuran cetak gembok (±2,5 cm); file jadi jauh lebih kecil
    return out.resize((round(out.width * 600 / out.height), 600), Image.LANCZOS)


def rapikan_footer(src):
    im = Image.open(src).convert("RGB")
    out = Image.new("RGBA", im.size)
    src_px, dst_px = im.load(), out.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b = src_px[x, y]
            a = 255 - min(r, g, b)  # seberapa jauh dari putih
            if a < 8:
                dst_px[x, y] = (255, 255, 255, 0)
                continue
            f = 255 / a
            # kembalikan warna asli tulisan sebelum dicampur latar putih
            dst_px[x, y] = tuple(max(0, min(255, round(255 - (255 - c) * f))) for c in (r, g, b)) + (a,)
    return out.crop(out.getbbox())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("gembok")
    ap.add_argument("footer")
    ap.add_argument("--output", default="aset_bawaan")
    a = ap.parse_args()
    out = Path(a.output)
    out.mkdir(parents=True, exist_ok=True)
    rapikan_gembok(a.gembok).save(out / "gembok.png", optimize=True)
    rapikan_footer(a.footer).save(out / "footer.png", optimize=True)
    print(f"Tersimpan: {out / 'gembok.png'}, {out / 'footer.png'}")


if __name__ == "__main__":
    main()
