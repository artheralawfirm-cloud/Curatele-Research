"""Sisipkan isi file helper ke dalam sumaker-barcode.user.js (di antara penanda HELPER-MULAI/HELPER-SELESAI).
Jalankan setiap kali file di folder helper/ diubah:  python helper/bangun.py"""
import json, pathlib
d = pathlib.Path(__file__).parent
js = d.parent / "sumaker-barcode.user.js"
s = js.read_text(encoding="utf-8")
crlf = lambda t: t.replace("\r\n", "\n").replace("\n", "\r\n")
isi = {n: crlf((d / n).read_text(encoding="ascii")) for n in
       ("PASANG-HELPER.bat", "pasang-helper.ps1", "helper-barcode.ps1", "HAPUS-HELPER.bat", "hapus-helper.ps1")}
blok = "  // <<HELPER-MULAI>> (dibuat otomatis oleh helper/bangun.py — jangan diedit di sini)\n"
blok += "  const BERKAS_HELPER = " + json.dumps(isi, ensure_ascii=True, indent=4).replace("\n", "\n  ") + ";\n"
blok += "  // <<HELPER-SELESAI>>"
a, b = s.index("  // <<HELPER-MULAI>>"), s.index("  // <<HELPER-SELESAI>>") + len("  // <<HELPER-SELESAI>>")
js.write_text(s[:a] + blok + s[b:], encoding="utf-8")
print("disisipkan:", ", ".join(isi))
