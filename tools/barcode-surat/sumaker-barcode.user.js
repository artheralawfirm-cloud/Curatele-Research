// ==UserScript==
// @name         SUMAKER Barcode Massal
// @namespace    bhp-medan
// @version      0.6.1
// @description  Tempel QR, gembok (Logo SE) dan footer SUMAKER ke banyak surat sekaligus di halaman Tanda Tangan Elektronik.
// @match        https://sumaker.kemenkum.go.id/main/dse*
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/artheralawfirm-cloud/Curatele-Research/main/tools/barcode-surat/sumaker-barcode.user.js
// @downloadURL  https://raw.githubusercontent.com/artheralawfirm-cloud/Curatele-Research/main/tools/barcode-surat/sumaker-barcode.user.js
// ==/UserScript==

/*
 * Cara kerja: setiap baris di tabel Tanda Tangan Elektronik sudah punya tautan Surat, QRCode,
 * Logo SE dan Footer miliknya sendiri. Skrip ini mengambil keempatnya per baris (jadi QR tidak
 * mungkin tertukar antarsurat), menempelkan QR + gembok di bawah tulisan "Kepala," dan footer di
 * bawah setiap halaman, lalu memberikan semua hasil dalam satu ZIP. Unggah balik lewat
 * "Kirim Surat" masih manual. Tidak ada data yang dikirim ke luar SUMAKER.
 */
(function () {
  'use strict';

  // Tampermonkey menjalankan skrip ini di ruang terpisah. Di sana pengganti setImmediate bawaan JSZip
  // (lewat postMessage) tidak pernah terpanggil, sehingga pembuatan ZIP macet. Pakai setTimeout saja.
  globalThis.setImmediate = (fn, ...args) => setTimeout(() => fn(...args), 0);

  // Posisi diukur dari contoh surat tugas BHP Medan (point, origin kiri-bawah seperti PDF).
  const TATA_LETAK = {
    jarakBawahJangkar: 2,
    qr: { x: 87, lebar: 71 },
    gembok: { lebar: 51, tinggi: 70 },
    footer: { x: 85, lebar: 468, tinggi: 21, jarakBawah: 36 },
    celahAtasFooter: 4,
    // QR + gembok selalu ukuran penuh. Bila ruang antara "Kepala," dan nama sempit, nama (dan semua yang di
    // bawahnya) digeser turun sampai ada celah ini di bawah QR + gembok.
    celahNama: 4,
    // Bila blok TTD terlalu bawah, isi halaman itu diperkecil seragam (paling kecil 92%) agar muat,
    // tanpa menambah halaman.
    skalaMin: 0.92,
  };
  const LINK = { surat: /^surat$/i, lampiran: /^lampiran$/i, qr: /^qr\s*code$/i, gembok: /^logo\s*se$/i, footer: /^footer$/i };

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  // ---------- ambil berkas dari SUMAKER ----------

  function jenis(bytes) {
    const b = bytes.slice(0, 4);
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
    if (b[0] === 0x89 && b[1] === 0x50) return 'png';
    if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
    // .docx/.xlsx = arsip ZIP (folder word/ atau xl/); .doc/.xls = berkas Office 97-2003 (OLE)
    if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
      const t = new TextDecoder('latin1').decode(bytes);
      return t.includes('word/') ? 'docx' : t.includes('xl/') ? 'xlsx' : 'zip';
    }
    if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) {
      const t = new TextDecoder('latin1').decode(bytes);
      return t.includes('W\0o\0r\0d\0D\0o\0c') ? 'doc' : t.includes('W\0o\0r\0k\0b\0o\0o\0k') ? 'xls' : 'ole';
    }
    return 'lain';
  }
  const COCOK = { surat: ['pdf', 'docx', 'doc', 'xlsx', 'xls'], lampiran: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'png', 'jpg'], pdf: ['pdf'], gambar: ['png', 'jpg'] };
  const KANTOR = ['docx', 'doc', 'xlsx', 'xls'];

  // Tautan bisa langsung ke berkas, atau ke halaman yang menampilkan berkas (img/iframe/embed).
  async function ambil(url, harap, kedalaman = 0) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const j = jenis(bytes);
    if (COCOK[harap].includes(j)) return { bytes, jenis: j };
    if (kedalaman > 0) throw new Error(`${url} bukan ${harap} (terdeteksi: ${j})`);
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'text/html');
    const pilih = harap === 'gambar'
      ? 'img[src]'
      : 'iframe[src], embed[src], object[data], a[href*=".pdf"], a[href*=".doc"]';
    const el = doc.querySelector(pilih);
    const src = el && (el.getAttribute('src') || el.getAttribute('data') || el.getAttribute('href'));
    if (!src) throw new Error(`${url} tidak berisi ${harap}`);
    return ambil(new URL(src, url).href, harap, kedalaman + 1);
  }

  // Lampiran terpisah (tombol "FILE LAMPIRAN" di SUMAKER). Tautan "Lampiran" ada di setiap baris, tetapi
  // hanya sebagian surat yang benar-benar punya lampiran: tanpa berkas (404, kosong, halaman tanpa berkas) → null.
  async function ambilLampiran(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (res.status === 404 || res.status === 204) return null;
    if (!res.ok) throw new Error(`lampiran → HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 16) return null;
    const j = jenis(bytes);
    if (COCOK.lampiran.includes(j)) return { bytes, jenis: j };
    // halaman HTML: ikuti tautan/bingkai yang memang menunjuk ke lampiran (bukan ke file surat)
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'text/html');
    const calon = [...doc.querySelectorAll('a[href], iframe[src], embed[src], object[data]')]
      .filter((el) => /lampiran/i.test((el.textContent || '') + ' ' + (el.getAttribute('href') || el.getAttribute('src') || el.getAttribute('data') || '')))
      .map((el) => el.getAttribute('href') || el.getAttribute('src') || el.getAttribute('data'))
      .filter((h) => h && !/^(javascript|#)/i.test(h));
    for (const h of calon) {
      const r = await fetch(new URL(h, url).href, { credentials: 'include' });
      if (!r.ok) continue;
      const isi = new Uint8Array(await r.arrayBuffer());
      const jj = jenis(isi);
      if (COCOK.lampiran.includes(jj)) return { bytes: isi, jenis: jj };
    }
    return null;
  }

  // gambar hasil pindai (JPG/PNG) → satu halaman A4, utuh di tengah
  async function gambarKePdf(bytes, j) {
    const pdf = await PDFLib.PDFDocument.create();
    const img = j === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const W = 595.28, H = 841.89, m = 20, s = Math.min((W - 2 * m) / img.width, (H - 2 * m) / img.height);
    pdf.addPage([W, H]).drawImage(img, { x: (W - img.width * s) / 2, y: (H - img.height * s) / 2, width: img.width * s, height: img.height * s });
    return pdf.save();
  }

  // gabungkan beberapa PDF berurutan
  async function gabungPdf(...daftar) {
    const out = await PDFLib.PDFDocument.create();
    for (const bytes of daftar) {
      const src = await PDFLib.PDFDocument.load(bytes);
      for (const pg of await out.copyPages(src, src.getPageIndices())) out.addPage(pg);
    }
    return out.save();
  }

  // ---------- rapikan gambar JPG (latar jadi transparan) ----------

  async function keCanvas(bytes) {
    const bmp = await createImageBitmap(new Blob([bytes]));
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    return { c, ctx, data: ctx.getImageData(0, 0, c.width, c.height) };
  }

  async function kePng(c) {
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }

  // Gembok: hanya latar di luar garis gembok (dan lubang lengkungnya) yang dibuat transparan.
  async function rapikanGembok(bytes) {
    const { c, ctx, data } = await keCanvas(bytes);
    const { width: w, height: h } = c, px = data.data;
    const seen = new Uint8Array(w * h);
    const benih = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [w >> 1, h >> 2]];
    for (const [sx, sy] of benih) {
      const i0 = (sy * w + sx) * 4, ref = [px[i0], px[i0 + 1], px[i0 + 2]];
      if (ref[0] < 200) continue; // benih bukan latar terang
      const stack = [sy * w + sx];
      while (stack.length) {
        const p = stack.pop();
        if (seen[p]) continue;
        const i = p * 4;
        if (Math.abs(px[i] - ref[0]) + Math.abs(px[i + 1] - ref[1]) + Math.abs(px[i + 2] - ref[2]) > 40) continue;
        seen[p] = 1; px[i + 3] = 0;
        const x = p % w, y = (p / w) | 0;
        if (x > 0) stack.push(p - 1);
        if (x < w - 1) stack.push(p + 1);
        if (y > 0) stack.push(p - w);
        if (y < h - 1) stack.push(p + w);
      }
    }
    ctx.putImageData(data, 0, 0);
    // 600 px tinggi ≈ 600 dpi pada ukuran cetak gembok; ukuran PDF jadi jauh lebih kecil
    if (h <= 600) return kePng(c);
    const k = document.createElement('canvas');
    k.height = 600; k.width = Math.round(w * 600 / h);
    k.getContext('2d').drawImage(c, 0, 0, k.width, k.height);
    return kePng(k);
  }

  // Footer: latar putih jadi transparan, warna tulisan dikembalikan.
  async function rapikanFooter(bytes) {
    const { c, ctx, data } = await keCanvas(bytes);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const a = 255 - Math.min(px[i], px[i + 1], px[i + 2]);
      if (a < 8) { px[i + 3] = 0; continue; }
      const f = 255 / a;
      for (let k = 0; k < 3; k++) px[i + k] = Math.max(0, Math.min(255, Math.round(255 - (255 - px[i + k]) * f)));
      px[i + 3] = a;
    }
    ctx.putImageData(data, 0, 0);
    return kePng(c);
  }

  // ---------- tempel ke PDF ----------

  // Baris jabatan penanda tangan yang berdiri sendiri, mis. "Kepala,", "Plt. Kepala,", "a.n. Kepala Balai …,".
  // Baris tembusan/isi surat tidak cocok. Halaman tambahan dengan TTD basah (mis. SPPD "Pejabat Pembuat
  // Komitmen") tidak diberi QR/gembok, tetapi tetap mendapat footer seperti semua halaman lain.
  const POLA_JANGKAR = /^((a\.?\s?n\.?|plt\.?|plh\.?)\s*)?kepala\b.*,$/i;

  // Kotak teks (koordinat PDF) dari item pdf.js
  function kotakTeks(it) {
    const h = Math.abs(it.transform[3]) || it.height || 10;
    return { x0: it.transform[4], x1: it.transform[4] + (it.width || 0), y0: it.transform[5] - 0.25 * h, y1: it.transform[5] + 0.8 * h, str: it.str.trim() };
  }

  // Word sering memecah satu baris menjadi beberapa potongan teks (mis. "Kepala" dan "," terpisah karena
  // formatnya beda). Potongan yang sebaris dan berdempetan disambung dulu sebelum dicocokkan ke pola jangkar.
  // Potongan yang berjauhan (mis. kolom "Tembusan" dan kolom tanda tangan) tetap terpisah.
  function barisTeks(kotak) {
    const urut = [...kotak].sort((a, b) => (Math.abs(a.y0 - b.y0) > 2 ? b.y0 - a.y0 : a.x0 - b.x0));
    const hasil = [];
    for (const k of urut) {
      const h = (k.y1 - k.y0) / 1.05;
      const akhir = hasil[hasil.length - 1];
      const celah = akhir ? k.x0 - akhir.x1 : Infinity;
      if (akhir && Math.abs(akhir.y0 - k.y0) <= 0.4 * h && celah > -1 && celah < 1.5 * h) {
        akhir.str += (celah > 0.15 * h ? ' ' : '') + k.str;
        akhir.x1 = k.x1; akhir.y0 = Math.min(akhir.y0, k.y0); akhir.y1 = Math.max(akhir.y1, k.y1);
      } else {
        hasil.push({ ...k });
      }
    }
    return hasil;
  }

  // Setiap halaman yang punya blok tanda tangan (surat, lampiran, SPPD, …) mendapat QR + gembok sendiri,
  // di bawah baris jabatan paling bawah pada halaman itu. `doc` (pdf.js) dikembalikan untuk dipakai lagi;
  // pemanggil wajib menutupnya dengan doc.destroy().
  async function cariJangkar(pdfBytes) {
    const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
    const teks = [], jangkar = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const items = (await (await doc.getPage(n)).getTextContent()).items.filter((it) => it.str && it.str.trim());
      teks.push(items.map(kotakTeks));
      // Judul SK "KEPALA BALAI HARTA PENINGGALAN MEDAN," (huruf kapital, langsung disusul "Menimbang")
      // bukan blok tanda tangan: di bawah baris jabatan penanda tangan selalu ada ruang kosong untuk TTD.
      const ruangBawah = (k) => {
        const b = teks[n - 1].filter((t) => t !== k && t.y1 < k.y0 && t.x0 < k.x0 + TATA_LETAK.gembok.lebar && t.x1 > k.x0);
        return b.length ? k.y0 - Math.max(...b.map((t) => t.y1)) : Infinity;
      };
      const judul = (k) => k.str === k.str.toUpperCase() && ruangBawah(k) < 20;
      const kandidat = barisTeks(teks[n - 1]).filter((k) => k.str.length <= 70 && POLA_JANGKAR.test(k.str) && !judul(k));
      if (kandidat.length) {
        const hit = kandidat.reduce((a, b) => (b.y0 < a.y0 ? b : a));
        jangkar.push({ halaman: n - 1, x: hit.x0, x1: hit.x1, yBawah: hit.y0, tinggi: hit.y1 - hit.y0, str: hit.str });
      }
    }
    return { doc, teks, jangkar };
  }

  // Tempelan tidak boleh menimpa tulisan apa pun (selisih 1 pt ditoleransi)
  function cekTabrakan(kotak, teks, nama, halaman) {
    for (const t of teks) {
      if (kotak.x0 < t.x1 - 1 && kotak.x1 > t.x0 + 1 && kotak.y0 < t.y1 - 1 && kotak.y1 > t.y0 + 1) {
        throw new Error(`${nama} akan menimpa tulisan "${t.str.slice(0, 40)}" di halaman ${halaman}; tempel manual`);
      }
    }
  }

  async function sematkan(pdf, aset) {
    return aset.jenis === 'png' ? pdf.embedPng(aset.bytes) : pdf.embedJpg(aset.bytes);
  }

  function muat(img, lebarMaks, tinggiMaks) {
    const s = Math.min(lebarMaks / img.width, tinggiMaks / img.height);
    return { width: img.width * s, height: img.height * s };
  }

  async function ukuranGambar(aset) {
    const i = await sematkan(await PDFLib.PDFDocument.create(), aset);
    return { width: i.width, height: i.height };
  }

  // Ruang kosong di bawah baris jabatan sampai tulisan teratas di kolom tanda tangan (biasanya nama penanda tangan).
  // Kolom tanda tangan = selebar baris jabatan (paling sempit selebar gembok), supaya nama yang ditaruh di tengah
  // tetap terhitung. Tulisan di kolom lain (mis. Tembusan di kiri) bukan nama; QR yang mengenainya tetap dicek.
  function ruangTtd(j, semua, lebarGembok) {
    const kanan = Math.max(j.x1, j.x + lebarGembok);
    const bawah = semua.filter((t) => t.y1 < j.yBawah && t.x0 < kanan && t.x1 > j.x);
    if (!bawah.length) return { ruang: Infinity, kanan };
    const atasNama = Math.max(...bawah.map((t) => t.y1));
    const ruang = j.yBawah - atasNama;
    // Tanpa satu baris kosong pun di bawahnya (jabatan dua baris "Kepala …," / "selaku …", atau baris isi surat yang
    // kebetulan mirip jabatan) ini bukan ruang tanda tangan: jangan dibuatkan ruang.
    if (ruang < j.tinggi) {
      throw new Error(`tidak ada baris kosong di bawah "${j.str.slice(0, 40)}" di halaman ${j.halaman + 1} (jabatan dua baris, atau bukan blok tanda tangan); tempel manual`);
    }
    return { ruang, atasNama, kanan };
  }

  // Selang kosong terbesar di antara lo dan hi yang tidak dilintasi kotak teks mana pun di halaman itu (min. 1 pt)
  function celahKosong(semua, lo, hi) {
    const tutup = semua.filter((t) => t.y1 > lo && t.y0 < hi).map((t) => [t.y0, t.y1]).sort((a, b) => a[0] - b[0]);
    let terbaik = null, dari = lo;
    for (const [a, b] of [...tutup, [hi, hi]]) {
      if (a - dari > (terbaik ? terbaik.hi - terbaik.lo : 1)) terbaik = { lo: dari, hi: a };
      dari = Math.max(dari, b);
    }
    return terbaik;
  }

  // Halaman digambar ke kanvas (2x) untuk melihat garis, kotak & gambar yang bukan teks (mis. garis tabel, cap).
  async function petaTinta(doc, n) {
    const hal = await doc.getPage(n + 1);
    const vp = hal.getViewport({ scale: 2, rotation: 0 });
    const kanvas = document.createElement('canvas');
    kanvas.width = Math.ceil(vp.width);
    kanvas.height = Math.ceil(vp.height);
    const ctx = kanvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, kanvas.width, kanvas.height);
    await hal.render({ canvasContext: ctx, viewport: vp }).promise;
    const { data } = ctx.getImageData(0, 0, kanvas.width, kanvas.height);
    const gelap = new Uint8Array(kanvas.width * kanvas.height);
    for (let i = 0, p = 0; i < gelap.length; i++, p += 4) gelap[i] = Math.min(data[p], data[p + 1], data[p + 2]) < 235 ? 1 : 0;
    return bacaTinta(gelap, kanvas.width, kanvas.height, (y) => vp.convertToViewportPoint(0, y)[1]);
  }

  // gelap: 1 piksel per byte (1 = bertinta), baris demi baris; keBaris: y PDF → baris piksel
  function bacaTinta(gelap, w, h, keBaris) {
    const baris = (y) => Math.min(h - 1, Math.max(0, Math.round(keBaris(y))));
    const sama = (a, b) => {
      for (let x = 0; x < w; x++) if (gelap[a * w + x] !== gelap[b * w + x]) return false;
      return true;
    };
    const kosong = (y) => {
      const r = baris(y) * w;
      for (let x = 0; x < w; x++) if (gelap[r + x]) return false;
      return true;
    };
    // semua baris piksel dari y0 sampai y1 sama dengan baris di y (kosong, atau hanya dilintasi garis tegak)
    const polos = (y0, y1, y) => {
      const acuan = baris(y);
      for (let r = baris(y1); r <= baris(y0); r++) if (!sama(r, acuan)) return false;
      return true;
    };
    // hanya garis tegak lurus (garis tabel) yang sama persis ±6 pt; tepi lingkaran cap/stempel tidak lolos
    return { kosong, polos, tegak: (y) => polos(y - 6, y + 6, y) };
  }

  // Rencana satu halaman TTD supaya QR + gembok muat ukuran penuh, atau null bila halaman tidak perlu diubah.
  // Hasil { skala, tx, ty, potong, potongBawah, turun, regang }: titik (x, y) → skala*(x, y − d) + (tx, ty), dengan
  // d = turun untuk bagian di antara potongBawah dan potong (nama, NIP, tembusan, …), selain itu d = 0 (bagian atas
  // dan kaki halaman tetap di tempat). regang: garis tegak (mis. garis tabel) disambung melintasi ruang tambahan.
  async function rencanakan(j, semua, H, U, tinta) {
    const hal = j.halaman + 1;
    const tolak = (alasan) => { throw new Error(`${alasan} di halaman ${hal}; tempel manual`); };
    const { ruang, atasNama, kanan } = ruangTtd(j, semua, U.g.width);
    const perlu = U.butuh + TATA_LETAK.celahNama;
    const kurangPada = (s) => Math.max(0, Math.ceil(perlu / s - ruang));
    const bulat = (s) => Math.floor(Math.min(1, s) * 1000) / 1000;
    const batasJangkar = (H - U.butuh - U.batasBawah) / (H - j.yBawah);
    const cekSkala = (s) => {
      if (s < TATA_LETAK.skalaMin) {
        tolak(`blok TTD tidak muat untuk QR & gembok ukuran penuh; isi halaman perlu diperkecil ke ${Math.round(s * 100)}% (batas ${TATA_LETAK.skalaMin * 100}%)`);
      }
    };
    const hasil = (skala, o) => ({ skala, tx: U.F.x * (1 - skala), ty: H * (1 - skala), potong: 0, potongBawah: 0, turun: 0, regang: false, ...o });

    // a) blok TTD terlalu dekat ke footer: isi halaman diperkecil seragam; cukup bila ruang di bawah jabatan lega
    let skala = bulat(batasJangkar);
    if (!kurangPada(skala)) {
      cekSkala(skala);
      return skala < 1 ? hasil(skala, {}) : null;
    }

    // b) ruang kurang: garis potong di ruang kosong di atas nama. Tidak boleh membelah tulisan mana pun; garis tabel,
    //    kotak atau gambar juga tidak, kecuali garis tegak murni (disambung dengan meregangkan irisan tipis).
    const celah = celahKosong(semua, atasNama, j.yBawah);
    if (!celah) tolak('tidak ada baris kosong di antara "Kepala," dan nama untuk memberi tempat QR & gembok');
    const r = await tinta();
    const tengah = (celah.lo + celah.hi) / 2, calon = [];
    for (let d = 0; d <= (celah.hi - celah.lo) / 2 - 0.5; d += 0.25) calon.push(tengah - d, tengah + d);
    let potong = calon.find((y) => r.kosong(y)), regang = false;
    if (potong === undefined) {
      potong = calon.find((y) => r.tegak(y));
      regang = potong !== undefined;
    }
    if (potong === undefined) tolak('garis atau gambar melintang di ruang tanda tangan');

    // c) baris berurutan di kolom lain (mis. daftar Tembusan di samping tanda tangan) tidak boleh terbelah
    const lain = semua.filter((t) => !(t.x0 < kanan && t.x1 > j.x));
    const atasP = lain.filter((t) => t.y0 >= potong && t.y0 - potong < t.y1 - t.y0);
    const bawahP = lain.filter((t) => t.y1 <= potong && potong - t.y1 < t.y1 - t.y0);
    if (atasP.some((a) => bawahP.some((b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 - b.y1 < 0.6 * (a.y1 - a.y0)))) {
      tolak('tulisan di samping tanda tangan akan terbelah');
    }

    // d) yang digeser: semua tulisan di bawah garis potong, kecuali kaki halaman Word (sejajar/di bawah footer)
    const dibawah = semua.filter((t) => t.y1 <= potong);
    const isi = dibawah.filter((t) => t.y1 > U.batasBawah);
    const lantai = Math.max(0, ...dibawah.filter((t) => t.y1 <= U.batasBawah).map((t) => t.y1));
    if (!isi.length) tolak('nama penanda tangan terlalu dekat ke footer');
    const terendah = Math.min(...isi.map((t) => t.y0));

    // e) bila tulisan yang digeser jadi terlalu dekat ke footer, isi halaman diperkecil seragam
    let turun;
    for (;;) {
      turun = kurangPada(skala);
      const s = bulat(Math.min(batasJangkar, (H - U.batasBawah) / (H - terendah + turun)));
      if (s === skala) break;
      skala = s;
      if (skala < TATA_LETAK.skalaMin) break;
    }
    cekSkala(skala);

    // f) batas bawah bagian yang digeser: tepat di bawah tulisan terendah (garis/gambar yang menempel ikut digeser).
    //    Tempat jatuhnya (turun pt di bawahnya) harus kosong, dan tidak boleh ada tinta yang jatuh ke dekat footer.
    const ty = H * (1 - skala), yFooter = (U.batasBawah - ty) / skala + turun;
    let potongBawah;
    for (let y = terendah - 0.5; y - turun > lantai; y -= 0.5) {
      if (!(r.kosong(y) || r.tegak(y)) || !r.polos(y - turun, y, y)) continue;
      if (y < yFooter && !r.polos(y, yFooter, y)) break;
      potongBawah = y;
      break;
    }
    if (potongBawah === undefined) tolak('tidak ada tempat kosong di bawah tanda tangan untuk menggeser nama');
    return hasil(skala, { potong, potongBawah, turun, regang });
  }

  async function tempel(pdfBytes, qr, gembok, footer) {
    const { doc, teks, jangkar } = await cariJangkar(pdfBytes);
    try {
      return await tempelKe(pdfBytes, doc, teks, jangkar, qr, gembok, footer);
    } finally {
      doc.destroy();
    }
  }

  async function tempelKe(pdfBytes, doc, teks, jangkar, qr, gembok, footer) {
    if (!jangkar.length) throw new Error('baris jabatan penanda tangan (mis. "Kepala,") tidak ditemukan; tempel manual');
    const pdf = await PDFLib.PDFDocument.load(pdfBytes);
    const jumlahHalaman = pdf.getPageCount();
    const F = TATA_LETAK.footer;
    const g = muat(await ukuranGambar(gembok), TATA_LETAK.gembok.lebar, TATA_LETAK.gembok.tinggi);
    const f = muat(await ukuranGambar(footer), F.lebar, F.tinggi);
    const q = TATA_LETAK.qr.lebar;
    const U = { F, f, g, q, batasBawah: F.jarakBawah + f.height + TATA_LETAK.celahAtasFooter, butuh: TATA_LETAK.jarakBawahJangkar + Math.max(q, g.height) };

    // 0) QR + gembok selalu ukuran penuh, seperti surat hasil SUMAKER: rencana per halaman TTD (lihat rencanakan)
    const ubahHal = new Map();
    for (const j of jangkar) {
      const u = await rencanakan(j, teks[j.halaman], pdf.getPage(j.halaman).getHeight(), U, () => petaTinta(doc, j.halaman));
      if (u) ubahHal.set(j.halaman, u);
    }

    // 1) halaman yang berubah disusun ulang di tempat dari salinan isinya sendiri (teks tetap teks, bukan gambar);
    //    tautan, anotasi dan pengaturan halaman tetap ada
    const N = PDFLib.PDFName.of;
    for (const [n, u] of ubahHal) {
      const p = pdf.getPage(n);
      const { x: mx, y: my, width: W, height: H } = p.getMediaBox();
      if (mx || my || p.getRotation().angle) throw new Error(`ukuran atau putaran halaman ${n + 1} tidak biasa; tempel manual`);
      const node = p.node.clone();
      node.delete(N('Annots'));
      const sumber = PDFLib.PDFPage.of(node, pdf.context.register(node), pdf);
      const y = (bawah, d) => u.skala * (bawah - d) + u.ty;
      const bagian = !u.turun ? [{ bawah: 0, atas: H, y: y(0, 0) }] : [
        { bawah: 0, atas: u.potongBawah, y: y(0, 0) },
        { bawah: u.potongBawah, atas: u.potong, y: y(u.potongBawah, u.turun) },
        { bawah: u.potong, atas: H, y: y(u.potong, 0) },
        ...(u.regang ? [{ bawah: u.potong - 0.5, atas: u.potong, y: y(u.potong, u.turun), regang: u.turun / 0.5 }] : []),
      ];
      p.node.set(N('Contents'), pdf.context.obj([]));
      p.node.set(N('Resources'), pdf.context.obj({}));
      for (const b of bagian) {
        const salinan = await pdf.embedPage(sumber, { left: 0, bottom: b.bawah, right: W, top: b.atas });
        p.drawPage(salinan, { x: u.tx, y: b.y, xScale: u.skala, yScale: u.skala * (b.regang || 1) });
      }
      const anotasi = p.node.Annots();
      for (let i = 0; anotasi && i < anotasi.size(); i++) {
        const a = anotasi.lookupMaybe(i, PDFLib.PDFDict);
        const kotak = a && a.lookupMaybe(N('Rect'), PDFLib.PDFArray);
        if (!kotak || kotak.size() !== 4) continue;
        const [x0, y0, x1, y1] = [0, 1, 2, 3].map((k) => kotak.lookup(k, PDFLib.PDFNumber).asNumber());
        const tengah = (y0 + y1) / 2, d = u.turun && tengah > u.potongBawah && tengah < u.potong ? u.turun : 0;
        a.set(N('Rect'), pdf.context.obj([u.skala * x0 + u.tx, y(y0, d), u.skala * x1 + u.tx, y(y1, d)]));
        a.delete(N('QuadPoints'));
      }
    }

    // 2) hitung semua posisi, lalu pastikan tidak ada tulisan yang tertimpa sebelum menempel apa pun
    const geser = (t, n) => {
      const u = ubahHal.get(n);
      if (!u) return t;
      const tengah = (t.y0 + t.y1) / 2, d = u.turun && tengah > u.potongBawah && tengah < u.potong ? u.turun : 0;
      return { ...t, x0: u.skala * t.x0 + u.tx, x1: u.skala * t.x1 + u.tx, y0: u.skala * (t.y0 - d) + u.ty, y1: u.skala * (t.y1 - d) + u.ty };
    };
    const teksHal = (n) => teks[n].map((t) => geser(t, n));
    const rencana = jangkar.map((j) => {
      const u = ubahHal.get(j.halaman) || { skala: 1, tx: 0, ty: 0 };
      const x = u.skala * j.x + u.tx, atas = u.skala * j.yBawah + u.ty - TATA_LETAK.jarakBawahJangkar;
      if (x + g.width > pdf.getPage(j.halaman).getWidth()) throw new Error(`gembok keluar dari tepi kanan halaman ${j.halaman + 1}`);
      const kQr = { x0: TATA_LETAK.qr.x, x1: TATA_LETAK.qr.x + q, y0: atas - q, y1: atas };
      const kGembok = { x0: x, x1: x + g.width, y0: atas - g.height, y1: atas };
      cekTabrakan(kQr, teksHal(j.halaman), 'QR code', j.halaman + 1);
      cekTabrakan(kGembok, teksHal(j.halaman), 'Gembok', j.halaman + 1);
      return { j, kQr, kGembok };
    });
    // footer: di bagian bawah SEMUA halaman dokumen
    const halFooter = pdf.getPages();
    const kFooter = { x0: F.x, x1: F.x + f.width, y0: F.jarakBawah, y1: F.jarakBawah + f.height };
    halFooter.forEach((p, n) => cekTabrakan(kFooter, teksHal(n), 'Footer', n + 1));

    // 3) tempel
    const [iQr, iGembok, iFooter] = [await sematkan(pdf, qr), await sematkan(pdf, gembok), await sematkan(pdf, footer)];
    for (const { j, kQr, kGembok } of rencana) {
      const p = pdf.getPage(j.halaman);
      p.drawImage(iQr, { x: kQr.x0, y: kQr.y0, width: kQr.x1 - kQr.x0, height: kQr.y1 - kQr.y0 });
      p.drawImage(iGembok, { x: kGembok.x0, y: kGembok.y0, width: kGembok.x1 - kGembok.x0, height: kGembok.y1 - kGembok.y0 });
    }
    for (const p of halFooter) p.drawImage(iFooter, { x: F.x, y: F.jarakBawah, ...f });
    // hanya menggambar di halaman yang ada; jumlah halaman tidak boleh berubah
    if (pdf.getPageCount() !== jumlahHalaman) throw new Error('jumlah halaman berubah');
    const halaman = jangkar.map((j) => j.halaman + 1).join(' & ');
    const catatan = [...ubahHal].flatMap(([n, u]) => [
      u.turun ? `nama penanda tangan di halaman ${n + 1} digeser turun ${u.turun} pt agar QR & gembok muat ukuran penuh` : '',
      u.skala < 1 ? `isi halaman ${n + 1} diperkecil ke ${(u.skala * 100).toFixed(1)}% agar muat` : '',
    ]).filter(Boolean).join('; ');
    return { bytes: await pdf.save(), halaman, catatan };
  }

  // ---------- surat Word: ruang tanda tangan ditambah di dokumennya sendiri ----------
  // Bila ruang di bawah "Kepala," kurang, paling rapi bila Word sendiri yang menata ulang suratnya (garis tabel, kaki
  // halaman dan tautan tetap utuh, teks tidak tersalin dobel): paragraf kosong setinggi kekurangannya disisipkan tepat
  // di bawah baris jabatan, lalu surat diubah ke PDF sekali lagi. Hasil itu dipakai hanya bila jumlah halaman dan letak
  // tanda tangan tetap sama dan ruangnya kini cukup; bila tidak, PDF pertama yang dipakai (nama digeser di PDF).

  const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  // Kekurangan ruang (pt) di bawah tiap baris jabatan, atau null bila ada blok tanda tangan yang tidak wajar
  async function kekuranganRuang(pdfBytes, g) {
    const { doc, teks, jangkar } = await cariJangkar(pdfBytes);
    try {
      const perlu = TATA_LETAK.jarakBawahJangkar + Math.max(TATA_LETAK.qr.lebar, g.height) + TATA_LETAK.celahNama;
      return {
        halaman: doc.numPages,
        jangkar: jangkar.map((j) => {
          const { ruang } = ruangTtd(j, teks[j.halaman], g.width);
          return { halaman: j.halaman, str: j.str, adaNama: ruang !== Infinity, kurang: Math.max(0, Math.ceil(perlu - ruang)) };
        }),
      };
    } catch (e) {
      return null;
    } finally {
      doc.destroy();
    }
  }

  // Sisipkan paragraf kosong setinggi `tambah` pt di bawah paragraf baris jabatan (dicocokkan berurutan dengan teksnya)
  async function sisipkanRuangDocx(docx, daftar) {
    const zip = await JSZip.loadAsync(docx);
    const berkas = zip.file('word/document.xml');
    if (!berkas) return null;
    const xml = new DOMParser().parseFromString(await berkas.async('string'), 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) return null;
    const dalamKotakTeks = (p) => {
      for (let e = p.parentNode; e; e = e.parentNode) if (e.localName === 'txbxContent') return true;
      return false;
    };
    const paragraf = Array.from(xml.getElementsByTagNameNS(NS_W, 'p')).filter((p) => !dalamKotakTeks(p));
    const rapat = (s) => s.replace(/\s+/g, '');
    const teksP = (p) => rapat(Array.from(p.getElementsByTagNameNS(NS_W, 't')).map((t) => t.textContent).join(''));
    const w = (nama, atribut = {}) => {
      const e = xml.createElementNS(NS_W, 'w:' + nama);
      for (const k in atribut) e.setAttributeNS(NS_W, 'w:' + k, atribut[k]);
      return e;
    };
    let i = 0;
    for (const s of daftar) {
      while (i < paragraf.length && teksP(paragraf[i]) !== rapat(s.str)) i++;
      if (i === paragraf.length) return null;
      if (s.tambah > 0) {
        const p = w('p'), pPr = w('pPr'), rPr = w('rPr');
        pPr.appendChild(w('spacing', { before: '0', after: '0', line: String(Math.round(s.tambah * 20)), lineRule: 'exact' }));
        rPr.appendChild(w('sz', { val: '2' }));
        rPr.appendChild(w('szCs', { val: '2' }));
        pPr.appendChild(rPr);
        p.appendChild(pPr);
        paragraf[i].parentNode.insertBefore(p, paragraf[i].nextSibling);
      }
      i++;
    }
    let isi = new XMLSerializer().serializeToString(xml);
    if (!isi.startsWith('<?xml')) isi = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + isi;
    zip.file('word/document.xml', isi);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  // { pdf, catatan }: PDF baru dari Word bila ruang tanda tangan berhasil ditambah di sana, selain itu PDF semula
  async function beriRuangDocx(docx, pdfBytes, gembok, apa, kabar = () => {}) {
    try {
      const g = muat(await ukuranGambar(gembok), TATA_LETAK.gembok.lebar, TATA_LETAK.gembok.tinggi);
      const awal = await kekuranganRuang(pdfBytes, g);
      if (!awal || !awal.jangkar.some((j) => j.kurang > 0)) return { pdf: pdfBytes };
      const tambah = (j) => (j.kurang ? j.kurang + 2 : 0);
      const docxBaru = await sisipkanRuangDocx(docx, awal.jangkar.map((j) => ({ str: j.str, tambah: tambah(j) })));
      if (!docxBaru) return { pdf: pdfBytes };
      kabar();
      const pdfBaru = await ubahBerkas(docxBaru, 'docx', apa);
      const akhir = await kekuranganRuang(pdfBaru, g);
      const cocok = akhir && akhir.halaman === awal.halaman && akhir.jangkar.length === awal.jangkar.length &&
        akhir.jangkar.every((j, k) => j.halaman === awal.jangkar[k].halaman && j.adaNama === awal.jangkar[k].adaNama && j.kurang === 0);
      if (!cocok) return { pdf: pdfBytes };
      const rinci = awal.jangkar.filter((j) => j.kurang).map((j) => `halaman ${j.halaman + 1} +${tambah(j)} pt`).join(', ');
      return { pdf: pdfBaru, catatan: `ruang tanda tangan ${apa} ditambah langsung di Word (${rinci})` };
    } catch (e) {
      return { pdf: pdfBytes };
    }
  }

  // ---------- baca tabel ----------

  function tabelSurat() {
    return [...document.querySelectorAll('table')].find((t) => /perihal/i.test(t.tHead?.textContent || t.rows[0]?.textContent || ''));
  }

  function bacaBaris() {
    const tabel = tabelSurat();
    if (!tabel) throw new Error('tabel surat tidak ditemukan di halaman ini');
    const kepala = [...(tabel.tHead || tabel).rows[0].cells].map((c) => c.textContent.trim().toUpperCase());
    const kol = (n) => kepala.indexOf(n);
    const baris = [];
    for (const tr of tabel.tBodies[0].rows) {
      if (tr.cells.length < 3) continue;
      const tautan = {};
      for (const a of tr.querySelectorAll('a')) {
        // abaikan ikon/simbol di depan teks tautan, mis. "🗎 Surat"
        const t = a.textContent.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
        for (const [k, re] of Object.entries(LINK)) if (re.test(t) && a.href && !a.href.startsWith('javascript')) tautan[k] = a.href;
      }
      baris.push({
        dipilih: !!tr.querySelector('input.bm-pilih:checked'),
        no: tr.cells[kol('NO')]?.textContent.trim() || String(baris.length + 1),
        perihal: tr.cells[kol('PERIHAL')]?.textContent.trim() || '',
        tautan,
      });
    }
    return baris;
  }

  // ---------- helper di komputer ini (Microsoft Word/Excel → PDF) ----------

  // <<HELPER-MULAI>> (dibuat otomatis oleh helper/bangun.py — jangan diedit di sini)
  const BERKAS_HELPER = {
      "PASANG-HELPER.bat": "@echo off\r\ntitle Pasang Helper Barcode SUMAKER\r\ncd /d \"%~dp0\"\r\nif not exist \"%~dp0pasang-helper.ps1\" (\r\n  echo File pendukung tidak ditemukan. Ekstrak dulu ZIP-nya: klik kanan, Extract All / Ekstrak Semua, lalu jalankan lagi dari folder hasil ekstrak.\r\n  echo.\r\n  pause\r\n  exit /b 1\r\n)\r\nset \"PS=%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\"\r\nif not exist \"%PS%\" set \"PS=powershell\"\r\n\"%PS%\" -NoProfile -ExecutionPolicy Bypass -File \"%~dp0pasang-helper.ps1\"\r\necho.\r\npause\r\n",
      "pasang-helper.ps1": "# Memasang Helper Barcode SUMAKER (cukup sekali per komputer)\r\n$ErrorActionPreference = 'Stop'\r\n$asal = Split-Path -Parent $MyInvocation.MyCommand.Path\r\n$sumber = Join-Path $asal 'helper-barcode.ps1'\r\nif (-not (Test-Path -LiteralPath $sumber)) { Write-Host 'File helper-barcode.ps1 tidak ditemukan. Ekstrak dulu ZIP-nya, lalu jalankan lagi.'; exit 1 }\r\n$dir = Join-Path $env:LOCALAPPDATA 'BarcodeSumaker'\r\nNew-Item -ItemType Directory -Force -Path $dir | Out-Null\r\n# hentikan helper lama (bila ada) supaya versi baru yang berjalan\r\ntry { Get-WmiObject Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*helper-barcode.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } } catch {}\r\n$tujuan = Join-Path $dir 'helper-barcode.ps1'\r\nCopy-Item -LiteralPath $sumber -Destination $tujuan -Force\r\ntry { Unblock-File -LiteralPath $tujuan -ErrorAction SilentlyContinue } catch {}   # tidak ada di PowerShell 2.0 (Windows 7); tidak apa-apa\r\n$ps = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'\r\n$arg = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"' + $tujuan + '\"'\r\n# aktif otomatis setiap komputer dinyalakan\r\n$startup = [Environment]::GetFolderPath('Startup')\r\n$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup 'Helper Barcode SUMAKER.lnk'))\r\n$lnk.TargetPath = $ps; $lnk.Arguments = $arg; $lnk.WindowStyle = 7; $lnk.Description = 'Helper Barcode SUMAKER'; $lnk.Save()\r\nStart-Process -FilePath $ps -ArgumentList $arg -WindowStyle Hidden\r\nWrite-Host 'Menyalakan helper...'\r\n$aktif = $false\r\nfor ($i = 0; $i -lt 10 -and -not $aktif; $i++) {\r\n  Start-Sleep -Seconds 1\r\n  try { $wc = New-Object System.Net.WebClient; $wc.Proxy = $null; [void]$wc.DownloadString('http://127.0.0.1:48653/ping'); $aktif = $true } catch {}\r\n}\r\nWrite-Host ''\r\nif ($aktif) {\r\n  Write-Host 'BERHASIL. Helper Barcode SUMAKER sudah terpasang dan aktif.'\r\n  Write-Host 'Mulai sekarang surat Word/Excel langsung jadi PDF final cukup dengan tombol kuning.'\r\n  Write-Host 'Helper akan aktif sendiri setiap komputer dinyalakan.'\r\n} else {\r\n  Write-Host 'Helper sudah terpasang, tetapi belum menjawab. Silakan restart komputer, lalu coba lagi.'\r\n}\r\n",
      "helper-barcode.ps1": "# Helper Barcode SUMAKER\r\n# Berjalan diam-diam di komputer ini dan hanya menerima permintaan dari komputer ini sendiri (127.0.0.1).\r\n# Plugin \"SUMAKER Barcode Massal\" mengirim surat Word/Excel ke sini; Microsoft Word/Excel mengubahnya ke PDF\r\n# (tampilan persis seperti dibuka di Word/Excel), lalu PDF dikirim balik ke plugin untuk ditempeli QR/gembok/footer.\r\n# Tidak ada data yang dikirim ke luar komputer ini.\r\n\r\n$ErrorActionPreference = 'Stop'\r\n$PORT = 48653\r\n$IZIN_ORIGIN = 'https://sumaker.kemenkum.go.id'\r\n$MAKS_BYTE = 60MB\r\n$DIAM_DETIK = 120   # Word/Excel ditutup bila tidak dipakai selama ini\r\n$VERSI = '2'\r\n\r\n$kerja = Join-Path $env:TEMP 'barcode-sumaker'\r\nNew-Item -ItemType Directory -Force -Path $kerja | Out-Null\r\n$catatan = Join-Path $kerja 'helper.log'\r\nfunction Tulis($pesan) { Add-Content -LiteralPath $catatan -Value ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $pesan) }\r\n\r\n$script:word = $null\r\n$script:excel = $null\r\n$script:terakhir = Get-Date\r\n\r\nfunction Tutup-Office {\r\n  if ($script:word) { try { $script:word.Quit() } catch {}; try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($script:word) } catch {}; $script:word = $null }\r\n  if ($script:excel) { try { $script:excel.Quit() } catch {}; try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($script:excel) } catch {}; $script:excel = $null }\r\n}\r\n\r\nfunction Ambil-Soffice {\r\n  $calon = @()\r\n  if ($env:ProgramFiles) { $calon += (Join-Path $env:ProgramFiles 'LibreOffice\\program\\soffice.exe') }\r\n  $pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')\r\n  if ($pf86) { $calon += (Join-Path $pf86 'LibreOffice\\program\\soffice.exe') }\r\n  $calon | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1\r\n}\r\n\r\nfunction Ubah-KePdf([string]$masuk, [string]$keluar, [bool]$isExcel) {\r\n  if (-not $isExcel) {\r\n    if (-not $script:word) {\r\n      try {\r\n        $script:word = New-Object -ComObject Word.Application\r\n        $script:word.Visible = $false\r\n        $script:word.DisplayAlerts = 0\r\n        $script:word.AutomationSecurity = 3   # makro dimatikan\r\n      } catch { $script:word = $null }\r\n    }\r\n    if ($script:word) {\r\n      # sandi palsu: surat yang dikunci sandi langsung GAGAL, bukan memunculkan jendela yang menghentikan helper\r\n      $doc = $script:word.Documents.Open($masuk, $false, $true, $false, 'x')\r\n      try { $doc.ExportAsFixedFormat($keluar, 17) } finally { $doc.Close(0) | Out-Null }\r\n      return 'word'\r\n    }\r\n  } else {\r\n    if (-not $script:excel) {\r\n      try {\r\n        $script:excel = New-Object -ComObject Excel.Application\r\n        $script:excel.Visible = $false\r\n        $script:excel.DisplayAlerts = $false\r\n        $script:excel.ScreenUpdating = $false\r\n        $script:excel.AutomationSecurity = 3\r\n      } catch { $script:excel = $null }\r\n    }\r\n    if ($script:excel) {\r\n      $wb = $script:excel.Workbooks.Open($masuk, 0, $true, [Type]::Missing, 'x')\r\n      try {\r\n        foreach ($ws in $wb.Worksheets) {\r\n          if ($ws.Visible -ne -1) { continue }\r\n          if ($script:excel.WorksheetFunction.CountA($ws.UsedRange) -eq 0) { continue }\r\n          try {\r\n            $ps = $ws.PageSetup\r\n            $ps.Zoom = $false; $ps.FitToPagesWide = 1; $ps.FitToPagesTall = $false\r\n            $ps.CenterHorizontally = $true\r\n            if ($ws.UsedRange.Width -gt $ws.UsedRange.Height) { $ps.Orientation = 2 }\r\n          } catch { Tulis ('pengaturan halaman sheet dilewati: ' + $_.Exception.Message) }\r\n        }\r\n        $wb.ExportAsFixedFormat(0, $keluar)\r\n      } finally { $wb.Close($false) | Out-Null }\r\n      return 'excel'\r\n    }\r\n  }\r\n  $soffice = Ambil-Soffice\r\n  if (-not $soffice) { throw 'Microsoft Word/Excel maupun LibreOffice tidak ditemukan di komputer ini' }\r\n  $dir = Split-Path -Parent $keluar\r\n  & $soffice --headless --convert-to pdf --outdir $dir $masuk | Out-Null\r\n  $hasil = Join-Path $dir ([System.IO.Path]::GetFileNameWithoutExtension($masuk) + '.pdf')\r\n  if (-not (Test-Path -LiteralPath $hasil)) { throw 'LibreOffice gagal mengubah file ini' }\r\n  if ($hasil -ne $keluar) { Move-Item -LiteralPath $hasil -Destination $keluar -Force }\r\n  return 'libreoffice'\r\n}\r\n\r\n$ascii = [System.Text.Encoding]::ASCII\r\nfunction Kirim($aliran, [int]$kode, [string]$status, [string]$jenisIsi, [byte[]]$isi, [string]$origin) {\r\n  if ($null -eq $isi) { $isi = New-Object byte[] 0 }\r\n  $h = 'HTTP/1.1 ' + $kode + ' ' + $status + [char]13 + [char]10\r\n  $h += 'Content-Type: ' + $jenisIsi + [char]13 + [char]10\r\n  $h += 'Content-Length: ' + $isi.Length + [char]13 + [char]10\r\n  $h += 'Connection: close' + [char]13 + [char]10\r\n  $h += 'Cache-Control: no-store' + [char]13 + [char]10\r\n  if ($origin -eq $IZIN_ORIGIN) {\r\n    $h += 'Access-Control-Allow-Origin: ' + $IZIN_ORIGIN + [char]13 + [char]10\r\n    $h += 'Access-Control-Allow-Methods: GET, POST, OPTIONS' + [char]13 + [char]10\r\n    $h += 'Access-Control-Allow-Headers: Content-Type, X-Jenis, X-Barcode-Sumaker' + [char]13 + [char]10\r\n    $h += 'Access-Control-Allow-Private-Network: true' + [char]13 + [char]10\r\n    $h += 'Access-Control-Expose-Headers: X-Pengubah' + [char]13 + [char]10\r\n  }\r\n  $h += [char]13 + [char]10\r\n  $kepala = $ascii.GetBytes($h)\r\n  $aliran.Write($kepala, 0, $kepala.Length)\r\n  if ($isi.Length -gt 0) { $aliran.Write($isi, 0, $isi.Length) }\r\n  $aliran.Flush()\r\n}\r\nfunction KirimTeks($aliran, [int]$kode, [string]$status, [string]$teks, [string]$origin) {\r\n  Kirim $aliran $kode $status 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes($teks)) $origin\r\n}\r\n\r\nfunction Baca-Permintaan($aliran) {\r\n  # baca kepala sampai baris kosong\r\n  $buf = New-Object System.IO.MemoryStream\r\n  $satu = New-Object byte[] 1\r\n  $akhir = 0\r\n  while ($true) {\r\n    $n = $aliran.Read($satu, 0, 1)\r\n    if ($n -le 0) { return $null }\r\n    $buf.WriteByte($satu[0])\r\n    if ($buf.Length -gt 65536) { throw 'kepala permintaan terlalu besar' }\r\n    $b = $buf.GetBuffer(); $L = $buf.Length\r\n    if ($L -ge 4 -and $b[$L - 4] -eq 13 -and $b[$L - 3] -eq 10 -and $b[$L - 2] -eq 13 -and $b[$L - 1] -eq 10) { break }\r\n  }\r\n  $teks = $ascii.GetString($buf.ToArray())\r\n  $baris = $teks -split ([string][char]13 + [char]10)\r\n  $awal = $baris[0] -split ' '\r\n  $kepala = @{}\r\n  foreach ($x in $baris[1..($baris.Length - 1)]) {\r\n    $i = $x.IndexOf(':')\r\n    if ($i -gt 0) { $kepala[$x.Substring(0, $i).Trim().ToLower()] = $x.Substring($i + 1).Trim() }\r\n  }\r\n  [int]$panjang = 0\r\n  if ($kepala.ContainsKey('content-length')) { $panjang = [int]$kepala['content-length'] }\r\n  if ($panjang -gt $MAKS_BYTE) { throw 'file terlalu besar' }\r\n  $isi = New-Object byte[] $panjang\r\n  [int]$dapat = 0\r\n  while ($dapat -lt $panjang) {\r\n    $n = $aliran.Read($isi, $dapat, $panjang - $dapat)\r\n    if ($n -le 0) { throw 'koneksi terputus' }\r\n    $dapat += $n\r\n  }\r\n  return @{ metode = $awal[0]; jalur = $awal[1]; kepala = $kepala; isi = $isi }\r\n}\r\n\r\nfunction Layani($klien) {\r\n  $aliran = $klien.GetStream()\r\n  $aliran.ReadTimeout = 30000\r\n  $origin = ''\r\n  try {\r\n    $req = Baca-Permintaan $aliran\r\n    if ($null -eq $req) { return }\r\n    if ($req.kepala.ContainsKey('origin')) { $origin = $req.kepala['origin'] }\r\n    # hanya halaman SUMAKER (atau plugin Tampermonkey, yang tidak mengirim Origin halaman lain) yang dilayani\r\n    if ($origin -and $origin -ne $IZIN_ORIGIN -and -not $origin.StartsWith('chrome-extension://') -and -not $origin.StartsWith('moz-extension://')) {\r\n      KirimTeks $aliran 403 'Forbidden' 'ditolak' ''\r\n      return\r\n    }\r\n    if ($req.metode -eq 'OPTIONS') { Kirim $aliran 204 'No Content' 'text/plain' $null $origin; return }\r\n    if ($req.metode -eq 'GET' -and $req.jalur -eq '/ping') { KirimTeks $aliran 200 'OK' ('helper-barcode-sumaker ' + $VERSI) $origin; return }\r\n    if ($req.metode -eq 'POST' -and $req.jalur -eq '/ubah') {\r\n      if (-not $req.kepala.ContainsKey('x-barcode-sumaker')) { KirimTeks $aliran 403 'Forbidden' 'ditolak' $origin; return }\r\n      $jenis = ''\r\n      if ($req.kepala.ContainsKey('x-jenis')) { $jenis = $req.kepala['x-jenis'].ToLower() }\r\n      if (@('docx', 'doc', 'xlsx', 'xls') -notcontains $jenis) { KirimTeks $aliran 400 'Bad Request' 'jenis file tidak didukung' $origin; return }\r\n      $id = [guid]::NewGuid().ToString('N')\r\n      $masuk = Join-Path $kerja ($id + '.' + $jenis)\r\n      $keluar = Join-Path $kerja ($id + '.pdf')\r\n      [System.IO.File]::WriteAllBytes($masuk, $req.isi)\r\n      try {\r\n        try {\r\n          $pengubah = Ubah-KePdf $masuk $keluar ($jenis -like 'xls*')\r\n        } catch {\r\n          # Word/Excel bisa macet atau tertutup sendiri: buka yang baru lalu coba sekali lagi\r\n          Tulis ('coba ulang: ' + $_.Exception.Message)\r\n          Tutup-Office\r\n          Remove-Item -LiteralPath $keluar -Force -ErrorAction SilentlyContinue\r\n          $pengubah = Ubah-KePdf $masuk $keluar ($jenis -like 'xls*')\r\n        }\r\n        $pdf = [System.IO.File]::ReadAllBytes($keluar)\r\n        Tulis ('OK ' + $jenis + ' ' + $req.isi.Length + ' byte -> ' + $pdf.Length + ' byte (' + $pengubah + ')')\r\n        Kirim $aliran 200 'OK' 'application/pdf' $pdf $origin\r\n      } finally {\r\n        Remove-Item -LiteralPath $masuk -Force -ErrorAction SilentlyContinue\r\n        Remove-Item -LiteralPath $keluar -Force -ErrorAction SilentlyContinue\r\n      }\r\n      $script:terakhir = Get-Date\r\n      return\r\n    }\r\n    KirimTeks $aliran 404 'Not Found' 'tidak ada' $origin\r\n  } catch {\r\n    Tulis ('GAGAL: ' + $_.Exception.Message)\r\n    try { KirimTeks $aliran 500 'Error' $_.Exception.Message $origin } catch {}\r\n  } finally {\r\n    try { $aliran.Close() } catch {}\r\n    try { $klien.Close() } catch {}\r\n  }\r\n}\r\n\r\n# satu helper saja per komputer\r\n$pendengar = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback), $PORT\r\ntry { $pendengar.Start() } catch { Tulis 'helper sudah berjalan (port terpakai); keluar.'; exit 0 }\r\nTulis ('helper berjalan di 127.0.0.1:' + $PORT)\r\n# Browser kadang membuka koneksi cadangan yang tidak pernah dipakai. Koneksi baru ditampung dulu dan baru\r\n# dilayani setelah datanya datang, supaya koneksi kosong tidak membuat helper macet.\r\n$antre = New-Object System.Collections.ArrayList\r\ntry {\r\n  while ($true) {\r\n    $ada = $false\r\n    while ($pendengar.Pending()) { [void]$antre.Add(@{ klien = $pendengar.AcceptTcpClient(); sejak = Get-Date }); $ada = $true }\r\n    foreach ($x in @($antre)) {\r\n      $k = $x.klien\r\n      $siap = $false; $tutup = $false\r\n      try {\r\n        if ($k.Available -gt 0) { $siap = $true }\r\n        elseif ($k.Client.Poll(0, [System.Net.Sockets.SelectMode]::SelectRead)) { $tutup = $true }   # ditutup tanpa data\r\n        elseif (((Get-Date) - $x.sejak).TotalSeconds -gt 30) { $tutup = $true }\r\n      } catch { $tutup = $true }\r\n      if ($siap) { $antre.Remove($x); Layani $k; $ada = $true }\r\n      elseif ($tutup) { $antre.Remove($x); try { $k.Close() } catch {} }\r\n    }\r\n    if (-not $ada) {\r\n      Start-Sleep -Milliseconds 50\r\n      if (($script:word -or $script:excel) -and ((Get-Date) - $script:terakhir).TotalSeconds -gt $DIAM_DETIK) { Tutup-Office }\r\n    }\r\n  }\r\n} finally {\r\n  foreach ($x in @($antre)) { try { $x.klien.Close() } catch {} }\r\n  Tutup-Office\r\n  $pendengar.Stop()\r\n}\r\n",
      "HAPUS-HELPER.bat": "@echo off\r\ntitle Hapus Helper Barcode SUMAKER\r\ncd /d \"%~dp0\"\r\nif not exist \"%~dp0hapus-helper.ps1\" (\r\n  echo File pendukung tidak ditemukan. Ekstrak dulu ZIP-nya: klik kanan, Extract All / Ekstrak Semua, lalu jalankan lagi dari folder hasil ekstrak.\r\n  echo.\r\n  pause\r\n  exit /b 1\r\n)\r\nset \"PS=%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\"\r\nif not exist \"%PS%\" set \"PS=powershell\"\r\n\"%PS%\" -NoProfile -ExecutionPolicy Bypass -File \"%~dp0hapus-helper.ps1\"\r\necho.\r\npause\r\n",
      "hapus-helper.ps1": "# Menghapus Helper Barcode SUMAKER dari komputer ini\r\ntry { Get-WmiObject Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*helper-barcode.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } } catch {}\r\nRemove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Startup')) 'Helper Barcode SUMAKER.lnk') -Force -ErrorAction SilentlyContinue\r\nRemove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'BarcodeSumaker') -Recurse -Force -ErrorAction SilentlyContinue\r\nWrite-Host 'Helper Barcode SUMAKER sudah dihapus dari komputer ini.'\r\n"
  };
  // <<HELPER-SELESAI>>

  const HELPER = 'http://127.0.0.1:48653';

  // permintaan ke helper lokal; lewat Tampermonkey (GM_xmlhttpRequest) bila ada, selain itu fetch biasa
  function minta(metode, url, { headers = {}, body = null, timeout = 180000 } = {}) {
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((ok, gagal) => GM_xmlhttpRequest({
        method: metode, url, headers, data: body ? new Blob([body]) : undefined, timeout, responseType: 'arraybuffer',
        onload: (r) => ok({ status: r.status, bytes: new Uint8Array(r.response || new ArrayBuffer(0)) }),
        onerror: () => gagal(new Error('helper tidak bisa dihubungi')),
        ontimeout: () => gagal(new Error('helper terlalu lama menjawab')),
      }));
    }
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    return fetch(url, { method: metode, headers, body, signal: ctl.signal })
      .then(async (r) => ({ status: r.status, bytes: new Uint8Array(await r.arrayBuffer()) }))
      .catch(() => { throw new Error('helper tidak bisa dihubungi'); })
      .finally(() => clearTimeout(t));
  }

  // versi helper yang tertanam di plugin ini; helper yang lebih lama tetap dipakai, tapi diminta diperbarui
  const VERSI_HELPER = Number((BERKAS_HELPER['helper-barcode.ps1'].match(/\$VERSI = '(\d+)'/) || [])[1] || 0);

  // 0 = helper tidak aktif; selain itu nomor versi helper yang sedang berjalan
  async function versiHelper() {
    try {
      const r = await minta('GET', HELPER + '/ping', { timeout: 2500 });
      const m = r.status === 200 && new TextDecoder().decode(r.bytes).match(/^helper-barcode-sumaker (\d+)/);
      return m ? Number(m[1]) || 1 : 0;
    } catch (e) { return 0; }
  }
  const helperAktif = async () => (await versiHelper()) > 0;

  // ---------- pembaruan plugin ----------
  // Tampermonkey memperbarui skrip sendiri lewat @updateURL; pemeriksaan ini hanya memberi tahu lebih cepat.
  const URL_SKRIP = 'https://raw.githubusercontent.com/artheralawfirm-cloud/Curatele-Research/main/tools/barcode-surat/sumaker-barcode.user.js';
  const lebihBaru = (a, b) => {
    const x = a.split('.').map(Number), y = b.split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    return false;
  };
  async function cekVersiBaru() {
    if (typeof GM_info === 'undefined') return null;
    try {
      const r = await minta('GET', URL_SKRIP + '?t=' + Date.now(), { timeout: 8000 });
      const v = r.status === 200 && (new TextDecoder().decode(r.bytes).match(/@version\s+([\d.]+)/) || [])[1];
      return v && lebihBaru(v, GM_info.script.version) ? v : null;
    } catch (e) { return null; }
  }

  async function ubahBerkas(bytes, j, apa = 'surat') {
    const r = await minta('POST', HELPER + '/ubah', { headers: { 'X-Jenis': j, 'X-Barcode-Sumaker': '1', 'Content-Type': 'application/octet-stream' }, body: bytes });
    if (r.status !== 200) throw new Error(apa + ' ini tidak bisa dibuka Word/Excel (file rusak atau dikunci sandi?). Buka file-nya di Word/Excel, simpan ulang, lalu coba lagi. Rincian: ' + new TextDecoder().decode(r.bytes).slice(0, 200));
    if (jenis(r.bytes) !== 'pdf') throw new Error('hasil dari helper bukan PDF');
    return r.bytes;
  }

  async function unduhPemasangHelper() {
    const zip = new JSZip();
    for (const [nama, isi] of Object.entries(BERKAS_HELPER)) zip.file(nama, isi);
    zip.file('BACA-SAYA.txt', [
      'PASANG HELPER BARCODE SUMAKER (cukup sekali di komputer ini):',
      '1. Klik kanan ZIP ini -> Extract All / Ekstrak Semua.',
      '2. Klik dua kali PASANG-HELPER. Tunggu sampai tertulis BERHASIL, lalu tutup jendelanya.',
      '3. Selesai. Muat ulang halaman SUMAKER. Surat Word/Excel kini langsung jadi PDF final dengan tombol kuning.',
      '',
      'Helper hanya bisa diakses dari komputer ini sendiri, dan surat diubah oleh Microsoft Word/Excel di komputer ini.',
      'Untuk menghapus: klik dua kali HAPUS-HELPER.',
    ].join('\r\n') + '\r\n');
    unduhZip(await zip.generateAsync({ type: 'blob' }), 'pasang-helper-barcode-sumaker.zip');
  }

  // ---------- proses ----------

  async function sha(bytes) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Nama file = Perihal Surat. Perihal yang sama persis diberi akhiran (2), (3), … agar tidak saling timpa.
  function beriNama(baris) {
    const dipakai = new Map();
    for (const b of baris) {
      const dasar = b.perihal.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || `surat ${b.no}`;
      const n = (dipakai.get(dasar.toLowerCase()) || 0) + 1;
      dipakai.set(dasar.toLowerCase(), n);
      b.dasar = n === 1 ? dasar : `${dasar} (${n})`;
      b.nama = `${b.dasar}.pdf`;
    }
  }

  // ---------- alat ubah Word → PDF (dijalankan di komputer pengguna dengan Microsoft Word) ----------

  const BAT = [
    '@echo off',
    'title Ubah surat Word/Excel ke PDF',
    'cd /d "%~dp0"',
    'if not exist "%~dp0ubah-ke-pdf.ps1" (',
    '  echo Ekstrak dulu ZIP-nya: klik kanan, Extract All / Ekstrak Semua, lalu jalankan lagi dari folder hasil ekstrak.',
    '  echo.',
    '  pause',
    '  exit /b 1',
    ')',
    'set "PS=%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"',
    'if not exist "%PS%" set "PS=powershell"',
    '"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0ubah-ke-pdf.ps1"',
    'echo.',
    'pause',
  ].join('\r\n') + '\r\n';

  const PS1 = [
    "$ErrorActionPreference = 'Stop'",
    '$root = Split-Path -Parent $MyInvocation.MyCommand.Path',
    "$src = Join-Path $root 'surat-asli'",
    "$out = Join-Path $root 'pdf-hasil'",
    'if (-not (Test-Path -LiteralPath $src)) { Write-Host "Folder surat-asli tidak ditemukan. Ekstrak dulu file ZIP-nya, lalu jalankan lagi."; exit 1 }',
    'New-Item -ItemType Directory -Force -Path $out | Out-Null',
    'try { Get-ChildItem -LiteralPath $root -Recurse | Where-Object { -not $_.PSIsContainer } | Unblock-File -ErrorAction SilentlyContinue } catch {}',
    "$files = @(Get-ChildItem -LiteralPath $src | Where-Object { -not $_.PSIsContainer -and $_.Extension -match '^\\.(docx?|xlsx?)$' })",
    "if ($files.Count -eq 0) { Write-Host 'Tidak ada file Word/Excel di folder surat-asli.'; exit 1 }",
    '$ok = 0; $gagal = @(); $word = $null; $excel = $null; $soffice = $null',
    'function Ambil-Soffice {',
    '  @("$env:ProgramFiles\\LibreOffice\\program\\soffice.exe", "${env:ProgramFiles(x86)}\\LibreOffice\\program\\soffice.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1',
    '}',
    'foreach ($f in $files) {',
    "  $pdf = Join-Path $out ($f.BaseName + '.pdf')",
    "  $isExcel = $f.Extension -match '^\\.xlsx?$'",
    '  try {',
    '    if (-not $isExcel) {',
    '      if ($word -eq $null) { try { $word = New-Object -ComObject Word.Application; $word.Visible = $false; $word.DisplayAlerts = 0 } catch { $word = $false } }',
    '    } else {',
    '      if ($excel -eq $null) { try { $excel = New-Object -ComObject Excel.Application; $excel.Visible = $false; $excel.DisplayAlerts = $false; $excel.ScreenUpdating = $false } catch { $excel = $false } }',
    '    }',
    '    if (-not $isExcel -and $word) {',
    "      $doc = $word.Documents.Open($f.FullName, $false, $true, $false, 'x')",
    '      try { $doc.ExportAsFixedFormat($pdf, 17) } finally { $doc.Close(0) | Out-Null }',
    '    } elseif ($isExcel -and $excel) {',
    "      $wb = $excel.Workbooks.Open($f.FullName, 0, $true, [Type]::Missing, 'x')",
    '      try {',
    '        foreach ($ws in $wb.Worksheets) {',
    '          if ($ws.Visible -ne -1) { continue }',
    '          if ($excel.WorksheetFunction.CountA($ws.UsedRange) -eq 0) { continue }',
    '          try {',
    '            $ps = $ws.PageSetup',
    '            $ps.Zoom = $false; $ps.FitToPagesWide = 1; $ps.FitToPagesTall = $false',
    '            $ps.CenterHorizontally = $true',
    '            if ($ws.UsedRange.Width -gt $ws.UsedRange.Height) { $ps.Orientation = 2 }',
    "          } catch { Write-Host ('       (pengaturan halaman sheet ' + $ws.Name + ' dilewati: ' + $_.Exception.Message + ')') }",
    '        }',
    '        $wb.ExportAsFixedFormat(0, $pdf)',
    '      } finally { $wb.Close($false) | Out-Null }',
    '    } else {',
    '      if ($soffice -eq $null) { $soffice = Ambil-Soffice; if ($soffice) { Write-Host "Microsoft Office tidak ada untuk $($f.Extension); memakai LibreOffice (tampilan bisa sedikit berbeda)." } }',
    "      if (-not $soffice) { throw 'Microsoft Word/Excel maupun LibreOffice tidak ditemukan di komputer ini' }",
    '      & $soffice --headless --convert-to pdf --outdir $out $f.FullName | Out-Null',
    "      if (-not (Test-Path -LiteralPath $pdf)) { throw 'LibreOffice gagal mengubah file ini' }",
    '    }',
    "    Write-Host ('OK     ' + $f.Name); $ok++",
    "  } catch { Write-Host ('GAGAL  ' + $f.Name + ' : ' + $_.Exception.Message); $gagal += $f.Name }",
    '}',
    'if ($word) { $word.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) }',
    'if ($excel) { $excel.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }',
    "Write-Host ''",
    'Write-Host ("Selesai: $ok dari $($files.Count) surat sudah jadi PDF di folder pdf-hasil.")',
    "if ($gagal.Count -gt 0) { Write-Host 'Yang gagal (barcode manual):'; $gagal | ForEach-Object { Write-Host ('  ' + $_) } }",
    "Write-Host 'Langkah berikutnya: kembali ke SUMAKER, klik \"Lanjut: tempel ke PDF\", pilih semua PDF di folder pdf-hasil.'",
    'Start-Process explorer.exe $out',
  ].join('\r\n') + '\r\n';

  const BACA = [
    'CARA PAKAI (surat dari SUMAKER berupa Word / Excel):',
    '1. Ekstrak (Extract All) file ZIP ini ke satu folder.',
    '2. Klik dua kali UBAH-KE-PDF.bat. Microsoft Word/Excel akan mengubah semua surat di folder',
    '   "surat-asli" menjadi PDF di folder "pdf-hasil" (tampilan persis seperti di Word/Excel;',
    '   sheet Excel diatur pas satu lebar halaman supaya rapi).',
    '3. Kembali ke halaman Tanda Tangan Elektronik di SUMAKER, klik tombol',
    '   "Lanjut: tempel ke PDF", lalu pilih SEMUA file PDF di folder "pdf-hasil".',
    '4. Plugin menempel QR, gembok, dan footer, lalu mengunduh ZIP berisi PDF final.',
    '',
    'PENTING: jangan ubah nama file. Kode [#......] di nama file dipakai untuk mencocokkan',
    'setiap surat dengan QR miliknya sendiri, supaya tidak tertukar.',
  ].join('\r\n') + '\r\n';

  // ---------- proses ----------

  // kunci baris = potongan sidik jari tautan "Surat" baris itu; dipakai untuk mencocokkan PDF hasil Word
  async function kunci(b) {
    return (await sha(new TextEncoder().encode(b.tautan.surat))).slice(0, 8);
  }

  function unduhZip(blob, nama) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nama });
    document.body.appendChild(a); a.click(); a.remove();
  }
  const hariIni = () => new Date().toISOString().slice(0, 10);

  function cekTautanLengkap(baris) {
    const kurang = baris.filter((b) => ['surat', 'qr', 'gembok', 'footer'].some((k) => !b.tautan[k]));
    if (kurang.length) throw new Error(`baris ${kurang.map((b) => b.no).join(', ')} tidak punya semua tautan Surat/QRCode/Logo SE/Footer. Klik "Cek tautan" dan kirim hasilnya ke pembuat skrip.`);
  }

  // jalankan fn untuk tiap item, paling banyak n sekaligus (unduhan jauh lebih cepat daripada satu per satu)
  async function serentak(items, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const x = items[i++]; await fn(x); }
    }));
  }

  // QR, gembok, footer per baris; gembok/footer di-cache per isi berkas; QR kembar = batal
  async function ambilAset(baris, log) {
    const cache = new Map();
    const rapikan = async (url, fn) => {
      const a = await ambil(url, 'gambar');
      const key = await sha(a.bytes);
      if (!cache.has(key)) cache.set(key, a.jenis === 'png' ? Promise.resolve(a) : fn(a.bytes).then((bytes) => ({ bytes, jenis: 'png' })));
      return cache.get(key);
    };
    const masalah = [];
    log(`Mengambil QR, gembok & footer ${baris.length} surat…`);
    await serentak(baris, 4, async (b) => {
      try {
        b.qr = await ambil(b.tautan.qr, 'gambar');
        b.gembok = await rapikan(b.tautan.gembok, rapikanGembok);
        b.footer = await rapikan(b.tautan.footer, rapikanFooter);
        b.qrHash = await sha(b.qr.bytes);
      } catch (e) {
        masalah.push(`baris ${b.no}: ${e.message}`);
      }
    });
    const qrHash = new Map();
    for (const b of baris) { // urutan tabel, supaya pesannya konsisten
      if (!b.qrHash) continue;
      if (qrHash.has(b.qrHash)) masalah.push(`QR baris ${b.no} sama persis dengan baris ${qrHash.get(b.qrHash)} (kemungkinan tertukar)`);
      qrHash.set(b.qrHash, b.no);
    }
    if (masalah.length) throw new Error('Dibatalkan, tidak ada surat yang diproses:\n' + masalah.join('\n'));
  }

  // tempel ke semua baris yang sudah punya b.pdf, lalu unduh ZIP hasil akhir
  // word: surat Word baru saja diubah lewat helper, jadi helper bisa dipakai lagi untuk menambah ruang tanda tangan
  async function tempelDanUnduh(baris, log, { word = false } = {}) {
    beriNama(baris);
    const zip = new JSZip(), laporan = [['no', 'perihal', 'file', 'halaman_ttd', 'status', 'lampiran', 'keterangan']];
    let ok = 0;
    for (const b of baris) {
      if (b.gagal) {
        laporan.push([b.no, b.perihal, '', '', 'GAGAL', b.ketLampiran || '-', b.gagal]);
        continue;
      }
      try {
        // Surat/lampiran Word yang ruang tanda tangannya sempit: ruangnya ditambah langsung di Word (beriRuangDocx)
        const ketWord = [];
        const kabar = (apa) => () => log(`Menambah ruang tanda tangan ${apa} ${b.no} di Word…`);
        if (word && b.jenisSurat === 'docx' && b.berkas) {
          const w = await beriRuangDocx(b.berkas, b.pdf, b.gembok, 'surat', kabar('surat'));
          b.pdf = w.pdf;
          if (w.catatan) ketWord.push(w.catatan);
        }
        if (word && b.lampiranStempel && b.lampiran && b.lampiran.jenis === 'docx') {
          const w = await beriRuangDocx(b.lampiran.bytes, b.lampiranPdf, b.gembok, 'lampiran', kabar('lampiran'));
          b.lampiranPdf = w.pdf;
          if (w.catatan) ketWord.push(w.catatan);
        }
        // Lampiran Word/Excel bagian dari surat: digabung dulu, lalu ikut diberi footer (+ QR/gembok di halaman "Kepala,").
        // Lampiran PDF/gambar (berkas pribadi: SK CPNS, SKP, …): digabung di belakang apa adanya, tanpa tempelan.
        const sumber = b.lampiranPdf && b.lampiranStempel ? await gabungPdf(b.pdf, b.lampiranPdf) : b.pdf;
        const r = await tempel(sumber, b.qr, b.gembok, b.footer);
        let hasil = r.bytes, ket = [...ketWord, r.catatan].filter(Boolean).join('; ');
        if (b.lampiranPdf && !b.lampiranStempel) {
          try {
            hasil = await gabungPdf(r.bytes, b.lampiranPdf);
          } catch (e) {
            const namaLampiran = b.nama.replace(/\.pdf$/, ' - LAMPIRAN.pdf');
            zip.file(namaLampiran, b.lampiranPdf);
            b.ketLampiran = 'TIDAK digabung (PDF terkunci/rusak) — diunggah terpisah: ' + namaLampiran;
            ket = [ket, 'lampiran tidak bisa digabung, ada di file terpisah'].filter(Boolean).join('; ');
          }
        }
        zip.file(b.nama, hasil);
        laporan.push([b.no, b.perihal, b.nama, r.halaman, 'OK', b.ketLampiran || '-', ket]);
        if (b.ketLampiran) log(`Lampiran ${b.no}: ${b.ketLampiran}.`);
        if (ket) log(`Catatan ${b.no}: ${ket}.`);
        ok++;
      } catch (e) {
        laporan.push([b.no, b.perihal, '', '', 'GAGAL', b.ketLampiran || '-', e.message]);
        log(`GAGAL ${b.no}: ${e.message}`);
      }
    }
    const csv = laporan.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    zip.file('laporan.csv', '﻿' + csv);
    unduhZip(await zip.generateAsync({ type: 'blob' }), `surat-barcode-${hariIni()}.zip`);
    log(`\n✅ Selesai: ${ok}/${baris.length} surat sudah jadi PDF final. File surat-barcode-${hariIni()}.zip sudah diunduh.\nNama tiap file = perihal surat; unggah lewat "Kirim Surat" di baris dengan perihal yang sama.`);
    if (ok < baris.length) log(`⚠ ${baris.length - ok} surat GAGAL (lihat alasannya di atas dan di laporan.csv). Surat itu belum dibarcode.`);
  }

  async function prosesSemua(log) {
    const baris = bacaBaris().filter((b) => b.dipilih);
    if (!baris.length) throw new Error('belum ada surat yang dicentang');
    log(`${baris.length} surat dipilih.`);
    cekTautanLengkap(baris);

    // 1) ambil berkas surat (+ lampiran bila ada): PDF langsung dibarcode; Word/Excel diubah ke PDF lewat Microsoft Office
    const masalah = [];
    log(`Mengambil ${baris.length} surat…`);
    await serentak(baris, 4, async (b) => {
      try {
        const r = await ambil(b.tautan.surat, 'surat');
        b.berkas = r.bytes; b.jenisSurat = r.jenis;
      } catch (e) {
        masalah.push(`baris ${b.no}: ${e.message}`);
        return;
      }
      if (!b.tautan.lampiran || b.tautan.lampiran === b.tautan.surat) return;
      try {
        const l = await ambilLampiran(b.tautan.lampiran);
        // isi sama persis dengan surat → bukan lampiran tersendiri
        if (l && (await sha(l.bytes)) !== (await sha(b.berkas))) b.lampiran = l;
      } catch (e) {
        b.gagal = 'lampiran gagal diambil (' + e.message + '); coba lagi agar lampiran tidak tertinggal';
      }
    });
    if (masalah.length) throw new Error('Dibatalkan, tidak ada surat yang diproses:\n' + masalah.join('\n'));
    const adaLampiran = baris.filter((b) => b.lampiran);
    if (adaLampiran.length) log(`${adaLampiran.length} surat punya lampiran: ${adaLampiran.map((b) => b.no).join(', ')}.`);
    const perluHelper = baris.some((b) => KANTOR.includes(b.jenisSurat) || (b.lampiran && KANTOR.includes(b.lampiran.jenis)));
    const office = baris.filter((b) => KANTOR.includes(b.jenisSurat));
    baris.filter((b) => b.jenisSurat === 'pdf').forEach((b) => (b.pdf = b.berkas));

    // lampiran → PDF; Word/Excel ikut ditempeli (bagian surat), PDF/gambar digabung apa adanya
    const siapkanLampiran = async (b, bisaUbah) => {
      const l = b.lampiran;
      if (!l) return;
      if (KANTOR.includes(l.jenis)) {
        if (!bisaUbah) throw new Error('lampiran Word/Excel perlu helper; pasang helper dulu (tombol biru)');
        b.lampiranPdf = await ubahBerkas(l.bytes, l.jenis, 'lampiran');
        b.lampiranStempel = true;
        b.ketLampiran = 'Word/Excel: digabung, diberi footer (+ QR & gembok di halaman "Kepala,")';
      } else {
        b.lampiranPdf = l.jenis === 'pdf' ? l.bytes : await gambarKePdf(l.bytes, l.jenis);
        b.lampiranStempel = false;
        b.ketLampiran = `${l.jenis.toUpperCase()}: digabung di belakang apa adanya (tanpa footer/TTE)`;
      }
    };

    // 2) semua surat sekaligus: Word/Excel → PDF lewat helper (satu per satu), bersamaan QR/gembok/footer diambil
    if (!perluHelper || await helperAktif()) {
      let batal = false; // QR/gembok/footer bermasalah → seluruh proses batal, tidak perlu lanjut mengubah
      const ubah = (async () => {
        for (const b of baris) {
          if (batal) break;
          if (b.gagal) { log(`GAGAL ${b.no}: ${b.gagal}`); continue; }
          try {
            if (KANTOR.includes(b.jenisSurat)) {
              log(`Mengubah ke PDF ${b.no}. ${b.perihal.slice(0, 50)}…`);
              b.pdf = await ubahBerkas(b.berkas, b.jenisSurat);
            }
            if (b.lampiran) log(`Menyiapkan lampiran ${b.no}…`);
            await siapkanLampiran(b, true);
          } catch (e) {
            b.gagal = e.message; // surat lain tetap diproses; yang ini dicatat GAGAL di laporan
            log(`GAGAL ${b.no}: ${e.message}`);
          }
        }
      })();
      const aset = ambilAset(baris, log).catch((e) => { batal = true; return e; });
      await ubah;
      const salah = await aset;
      if (salah instanceof Error) throw salah;
      if (!baris.some((b) => !b.gagal)) throw new Error('tidak ada surat yang berhasil disiapkan. Lihat alasannya di atas.');
      await tempelDanUnduh(baris, log, { word: true });
      return;
    }

    // 3) helper belum ada: PDF tetap langsung dibarcode; Word/Excel lewat cara cadangan 3 langkah
    if (office.length) {
      beriNama(office);
      const zip = new JSZip();
      for (const b of office) {
        const nama = `${b.dasar.slice(0, 110)} [#${await kunci(b)}].${b.jenisSurat}`;
        zip.file(`surat-asli/${nama}`, b.berkas);
      }
      zip.file('UBAH-KE-PDF.bat', BAT);
      zip.file('ubah-ke-pdf.ps1', PS1);
      zip.file('BACA-SAYA.txt', BACA);
      unduhZip(await zip.generateAsync({ type: 'blob' }), `surat-word-excel-${hariIni()}.zip`);
      log(`\nHelper belum terpasang di komputer ini, jadi ${office.length} surat Word/Excel diunduh dulu: surat-word-excel-${hariIni()}.zip — ikuti petunjuk hijau di atas.\nSupaya lain kali cukup sekali klik, pasang helper (tombol biru di atas).`);
      sorotLanjut(true);
    }
    const pdf = baris.filter((b) => b.jenisSurat === 'pdf');
    for (const b of pdf) {
      if (b.gagal) continue;
      try { await siapkanLampiran(b, false); } catch (e) { b.gagal = e.message; }
    }
    if (pdf.length) {
      await ambilAset(pdf, log);
      await tempelDanUnduh(pdf, log);
    }
  }

  // Tahap 2: PDF hasil Word dipilih dari komputer → dicocokkan ke barisnya lewat kode [#........]
  // tombol "Lanjut" disorot hijau selama ada surat Word/Excel yang menunggu PDF-nya
  const PETUNJUK_AWAL = '<b>1.</b> Centang surat di kolom NO.<br><b>2.</b> Klik tombol kuning. PDF final langsung terunduh.';
  const PETUNJUK_WORD = '<div style="background:#e6f4ea;border:1px solid #188038;border-radius:6px;padding:8px;font-size:13px;line-height:1.5">' +
    '<b>Surat Word/Excel sudah diunduh (ZIP). Sekarang:</b><br>' +
    '<b>①</b> Buka folder <b>Unduhan</b>, klik kanan file <b>surat-word-excel-….zip</b> → <b>Extract All / Ekstrak Semua</b>.<br>' +
    '<b>②</b> Di folder hasil ekstrak, klik dua kali <b>UBAH-KE-PDF</b>. Tunggu sampai tertulis <b>Selesai</b>.<br>' +
    '<b>③</b> Klik tombol <b style="color:#188038">HIJAU</b> di bawah, pilih <b>semua</b> PDF di folder <b>pdf-hasil</b> (<b>Ctrl+A</b> → <b>Open</b>).</div>';

  function sorotLanjut(nyala) {
    const t = document.querySelector('[data-a="lanjut"]');
    const pet = document.querySelector('.bm-petunjuk');
    if (pet) pet.innerHTML = nyala ? PETUNJUK_WORD : PETUNJUK_AWAL;
    if (!t) return;
    if (nyala) t.style.display = '';
    Object.assign(t.style, nyala
      ? { background: '#188038', color: '#fff', border: '0', fontWeight: 'bold', padding: '9px', animation: 'bmkedip 1.2s infinite' }
      : { background: '#fff', color: '#1a73e8', border: '1px solid #1a73e8', fontWeight: 'normal', padding: '6px', animation: 'none' });
    t.textContent = nyala ? '③ Klik di sini: pilih semua PDF di folder pdf-hasil' : 'Lanjut: tempel ke PDF (hasil Word/Excel)';
  }

  async function prosesDariPdf(files, log) {
    const semua = bacaBaris();
    const peta = new Map();
    for (const b of semua) if (b.tautan.surat) peta.set(await kunci(b), b);
    const baris = [], masalah = [];
    for (const f of files) {
      const m = f.name.match(/\[#([0-9a-f]{8})\]\.pdf$/i);
      const b = m && peta.get(m[1].toLowerCase());
      if (!m) { masalah.push(`${f.name}: bukan dari folder pdf-hasil, atau nama filenya diubah (pilih file di folder pdf-hasil, jangan diganti namanya)`); continue; }
      if (!b) { masalah.push(`${f.name}: suratnya tidak terlihat di tabel (ubah "Show" jadi 100 supaya semua surat tampil, lalu klik lagi)`); continue; }
      if (baris.includes(b)) { masalah.push(`${f.name}: surat yang sama dipilih dua kali`); continue; }
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (jenis(bytes) !== 'pdf') { masalah.push(`${f.name}: bukan file PDF`); continue; }
      b.pdf = bytes;
      baris.push(b);
    }
    if (masalah.length) throw new Error('Dibatalkan, tidak ada surat yang diproses:\n' + masalah.join('\n'));
    if (!baris.length) throw new Error('belum ada file PDF yang dipilih');
    baris.sort((a, b) => semua.indexOf(a) - semua.indexOf(b)); // urutan tabel → nama "(2)" konsisten
    sorotLanjut(false);
    log(`${baris.length} PDF hasil Word/Excel cocok dengan suratnya di tabel.`);
    cekTautanLengkap(baris);
    await ambilAset(baris, log);
    await tempelDanUnduh(baris, log);
  }

  // Diagnostik: tampilkan tautan baris pertama dan jenis berkasnya, untuk menyesuaikan skrip.
  async function cekTautan(log) {
    const semua = bacaBaris();
    const b = semua.find((x) => x.dipilih) || semua[0]; // surat yang dicentang, atau baris pertama
    if (!b) return log('Tidak ada baris surat.');
    log(`Baris ${b.no}: ${b.perihal.slice(0, 60)}`);
    for (const k of Object.keys(LINK)) {
      const url = b.tautan[k];
      if (!url) { log(`  ${k}: TIDAK DITEMUKAN`); continue; }
      try {
        if (k === 'lampiran') {
          const l = await ambilLampiran(url);
          log(l ? `  lampiran: ADA (${l.jenis}, ${l.bytes.length} byte)` : '  lampiran: tidak ada');
          continue;
        }
        const r = await ambil(url, k === 'surat' ? 'surat' : 'gambar');
        log(`  ${k}: OK (${r.jenis}, ${r.bytes.length} byte)`);
      } catch (e) {
        log(`  ${k}: ${e.message}`);
      }
    }
  }

  // ---------- kotak centang per baris ----------

  function pasangCentang(saatBerubah) {
    const tabel = tabelSurat();
    if (!tabel) return;
    const kotak = (cls) => Object.assign(document.createElement('input'), { type: 'checkbox', className: cls });
    const th = (tabel.tHead || tabel).rows[0].cells[0];
    if (!th.querySelector('.bm-semua')) {
      const semua = kotak('bm-semua');
      semua.title = 'Pilih semua surat di halaman ini';
      semua.style.cssText = 'margin-right:6px;transform:scale(1.3)';
      semua.onchange = () => {
        tabel.querySelectorAll('input.bm-pilih').forEach((c) => (c.checked = semua.checked));
        saatBerubah();
      };
      th.prepend(semua);
    }
    for (const tr of tabel.tBodies[0].rows) {
      if (tr.cells.length < 3 || tr.cells[0].querySelector('.bm-pilih')) continue;
      const c = kotak('bm-pilih');
      c.style.cssText = 'margin-right:6px;transform:scale(1.3);cursor:pointer';
      c.onchange = saatBerubah;
      tr.cells[0].prepend(c);
    }
  }

  // ---------- panel ----------

  function panel() {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;width:380px;background:#fff;color:#222;' +
      'border:2px solid #f5c400;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);font:13px sans-serif;padding:10px';
    box.innerHTML = '<b>Barcode Massal</b><div class="bm-petunjuk" style="font-size:12px;color:#333;margin-top:4px;line-height:1.45">' +
      PETUNJUK_AWAL + '</div><div style="margin:8px 0;display:flex;gap:6px">' +
      '<button data-a="proses" style="flex:1;padding:6px;background:#f5c400;border:0;border-radius:4px;font-weight:bold;cursor:pointer">Centang surat dulu</button>' +
      '<button data-a="cek" style="padding:6px;border:1px solid #999;border-radius:4px;background:#fff;cursor:pointer">Cek tautan</button></div>' +
      '<style>@keyframes bmkedip{50%{box-shadow:0 0 0 5px rgba(24,128,56,.35)}}</style>' +
      '<div class="bm-helper" style="font-size:12px;margin-bottom:8px"></div>' +
      '<button data-a="lanjut" style="display:none;width:100%;margin-bottom:8px;padding:6px;border:1px solid #1a73e8;color:#1a73e8;border-radius:4px;background:#fff;cursor:pointer">Lanjut: tempel ke PDF (hasil Word/Excel)</button>' +
      '<input type="file" accept=".pdf,application/pdf" multiple style="display:none">' +
      '<pre style="max-height:220px;overflow:auto;white-space:pre-wrap;margin:0;font-size:12px"></pre>';
    document.body.appendChild(box);
    const out = box.querySelector('pre');
    const log = (s) => { out.textContent += s + '\n'; out.scrollTop = out.scrollHeight; };
    const tombol = box.querySelector('[data-a="proses"]');
    let sibuk = false;
    const perbarui = () => {
      const n = document.querySelectorAll('input.bm-pilih:checked').length;
      tombol.textContent = n ? `Barcode surat terpilih (${n})` : 'Centang surat dulu';
      tombol.disabled = sibuk || !n;
      tombol.style.opacity = tombol.disabled ? '.5' : '1';
    };
    const pilihFile = box.querySelector('input[type=file]');
    const jalankan = async (tugas) => {
        sibuk = true;
        box.querySelectorAll('button').forEach((x) => (x.disabled = true));
        out.textContent = '';
        try {
          await tugas();
        } catch (e) {
          log('⚠ ' + e.message);
        } finally {
          sibuk = false;
          box.querySelectorAll('button').forEach((x) => (x.disabled = false));
          perbarui();
        }
    };
    box.querySelector('[data-a="proses"]').onclick = () => jalankan(() => prosesSemua(log));
    box.querySelector('[data-a="cek"]').onclick = () => jalankan(() => cekTautan(log));
    box.querySelector('[data-a="lanjut"]').onclick = () => { pilihFile.value = ''; pilihFile.click(); };
    // status helper Word/Excel: dicek saat dibuka, lalu tiap 5 detik selama belum aktif
    const statusHelper = box.querySelector('.bm-helper');
    const lanjut = box.querySelector('[data-a="lanjut"]');
    let helperOk = null;
    const windows = /Windows/i.test(navigator.userAgent);
    const pasangHelper = async () => {
      out.textContent = '';
      log('Menyiapkan file pemasang helper…');
      try {
        await unduhPemasangHelper();
      } catch (e) {
        log('⚠ File pemasang gagal dibuat: ' + e.message + '\nMinta file pasang-helper-barcode-sumaker.zip ke admin, lalu ikuti langkah di bawah.');
      }
      log('File pasang-helper-barcode-sumaker.zip sudah diunduh. Lalu:\n' +
        '① Buka folder Unduhan, klik kanan ZIP itu → Extract All / Ekstrak Semua.\n' +
        '② Klik dua kali PASANG-HELPER, tunggu tulisan BERHASIL, tutup jendelanya.\n' +
        '③ Kotak ini berubah jadi ✔ hijau dengan sendirinya. Selesai.');
    };
    const cekHelper = async () => {
      const versi = await versiHelper(), ok = versi > 0;
      if (ok && versi < VERSI_HELPER) {
        if (helperOk === 'lama') return;
        helperOk = 'lama';
        statusHelper.innerHTML = '<div style="background:#fff4e5;border:1px solid #e37400;border-radius:6px;padding:7px;line-height:1.45">' +
          '✔ Helper aktif, tetapi ada <b>versi baru</b>. Surat tetap bisa diproses; perbarui bila sempat.' +
          '<button data-a="pasang" style="display:block;width:100%;margin-top:6px;padding:6px;background:#e37400;color:#fff;border:0;border-radius:4px;font-weight:bold;cursor:pointer">Perbarui helper</button></div>';
        lanjut.style.display = 'none';
        statusHelper.querySelector('[data-a="pasang"]').onclick = pasangHelper;
        return;
      }
      if (!ok && !windows) {
        statusHelper.innerHTML = '<span style="color:#666">Komputer ini bukan Windows: surat PDF bisa dibarcode, surat Word/Excel perlu komputer Windows yang ada Microsoft Word.</span>';
        helperOk = false;
        return;
      }
      if (ok === helperOk) return;
      helperOk = ok;
      if (ok) {
        statusHelper.innerHTML = '<span style="color:#188038">✔ Helper Word/Excel aktif — surat Word/Excel langsung jadi PDF final.</span>';
        if (out.textContent.includes('PASANG-HELPER')) out.textContent = '✔ Helper sudah terpasang. Sekarang centang surat, lalu klik tombol kuning.\n';
        if (!lanjut.style.animation || lanjut.style.animation === 'none') lanjut.style.display = 'none';
      } else {
        statusHelper.innerHTML = '<div style="background:#e8f0fe;border:1px solid #1a73e8;border-radius:6px;padding:7px;line-height:1.45">' +
          'Surat Word/Excel: pasang helper <b>sekali saja</b> di komputer ini, supaya cukup tombol kuning.' +
          '<button data-a="pasang" style="display:block;width:100%;margin-top:6px;padding:6px;background:#1a73e8;color:#fff;border:0;border-radius:4px;font-weight:bold;cursor:pointer">Pasang helper (sekali saja)</button></div>';
        lanjut.style.display = '';
        statusHelper.querySelector('[data-a="pasang"]').onclick = pasangHelper;
      }
    };
    cekHelper();
    setInterval(() => { if (helperOk !== true && !sibuk) cekHelper(); }, 5000);
    cekVersiBaru().then((v) => {
      if (!v) return;
      const b = document.createElement('div');
      b.style.cssText = 'background:#e6f4ea;border:1px solid #188038;border-radius:6px;padding:7px;margin:6px 0;font-size:12px;line-height:1.45';
      b.innerHTML = `🔔 Versi baru plugin (${v}) tersedia. <a href="${URL_SKRIP}" target="_blank" style="font-weight:bold;color:#188038">Perbarui sekarang</a> → klik <b>Perbarui/Update</b> di Tampermonkey, lalu muat ulang halaman ini.`;
      box.querySelector('.bm-petunjuk').after(b);
    });
    pilihFile.onchange = () => { if (pilihFile.files.length) jalankan(() => prosesDariPdf([...pilihFile.files], log)); };
    // tabel bisa digambar ulang (ganti halaman, cari); pasang lagi kotak centangnya
    pasangCentang(perbarui);
    const tabel = tabelSurat();
    if (tabel) new MutationObserver(() => { pasangCentang(perbarui); perbarui(); }).observe(tabel, { childList: true, subtree: true });
    perbarui();
  }

  panel();
})();
