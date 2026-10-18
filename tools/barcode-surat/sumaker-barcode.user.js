// ==UserScript==
// @name         SUMAKER Barcode Massal
// @namespace    bhp-medan
// @version      0.1.0
// @description  Tempel QR, gembok (Logo SE) dan footer SUMAKER ke banyak surat sekaligus di halaman Tanda Tangan Elektronik.
// @match        https://sumaker.kemenkum.go.id/main/dse*
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @grant        none
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

  // Posisi diukur dari contoh surat tugas BHP Medan (point, origin kiri-bawah seperti PDF).
  const TATA_LETAK = {
    jarakBawahJangkar: 2,
    qr: { x: 87, lebar: 71 },
    gembok: { lebar: 51, tinggi: 70 },
    footer: { x: 85, lebar: 468, tinggi: 21, jarakBawah: 36 },
    celahAtasFooter: 4,
    // Bila blok TTD terlalu bawah, isi halaman itu diperkecil seragam (paling kecil 92%) agar muat,
    // tanpa menggeser teks satu per satu dan tanpa menambah halaman.
    skalaMin: 0.92,
  };
  const LINK = { surat: /^surat$/i, qr: /^qr\s*code$/i, gembok: /^logo\s*se$/i, footer: /^footer$/i };

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  // ---------- ambil berkas dari SUMAKER ----------

  function jenis(bytes) {
    const b = bytes.slice(0, 4);
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
    if (b[0] === 0x89 && b[1] === 0x50) return 'png';
    if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
    return 'lain';
  }

  // Tautan bisa langsung ke berkas, atau ke halaman yang menampilkan berkas (img/iframe/embed).
  async function ambil(url, harap, kedalaman = 0) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const j = jenis(bytes);
    if (harap === 'pdf' ? j === 'pdf' : j === 'png' || j === 'jpg') return { bytes, jenis: j };
    if (kedalaman > 0) throw new Error(`${url} bukan ${harap} (terdeteksi: ${j})`);
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'text/html');
    const pilih = harap === 'pdf'
      ? 'iframe[src], embed[src], object[data], a[href*=".pdf"]'
      : 'img[src]';
    const el = doc.querySelector(pilih);
    const src = el && (el.getAttribute('src') || el.getAttribute('data') || el.getAttribute('href'));
    if (!src) throw new Error(`${url} tidak berisi ${harap}`);
    return ambil(new URL(src, url).href, harap, kedalaman + 1);
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
  // Komitmen") tidak ditempeli, sama seperti surat asli hasil SUMAKER.
  const POLA_JANGKAR = /^((a\.?\s?n\.?|plt\.?|plh\.?)\s*)?kepala\b.*,$/i;

  // Kotak teks (koordinat PDF) dari item pdf.js
  function kotakTeks(it) {
    const h = Math.abs(it.transform[3]) || it.height || 10;
    return { x0: it.transform[4], x1: it.transform[4] + (it.width || 0), y0: it.transform[5] - 0.25 * h, y1: it.transform[5] + 0.8 * h, str: it.str.trim() };
  }

  // Setiap halaman yang punya blok tanda tangan (surat, lampiran, SPPD, …) mendapat QR + gembok sendiri,
  // di bawah baris jabatan paling bawah pada halaman itu.
  async function cariJangkar(pdfBytes) {
    const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
    const teks = [], jangkar = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const items = (await (await doc.getPage(n)).getTextContent()).items.filter((it) => it.str && it.str.trim());
      teks.push(items.map(kotakTeks));
      const kandidat = teks[n - 1].filter((k) => k.str.length <= 70 && POLA_JANGKAR.test(k.str));
      if (kandidat.length) {
        const hit = kandidat.reduce((a, b) => (b.y0 < a.y0 ? b : a));
        jangkar.push({ halaman: n - 1, x: hit.x0, yBawah: hit.y0 });
      }
    }
    return { teks, jangkar };
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

  async function tempel(pdfBytes, qr, gembok, footer) {
    const { teks, jangkar } = await cariJangkar(pdfBytes);
    if (!jangkar.length) throw new Error('baris jabatan penanda tangan (mis. "Kepala,") tidak ditemukan; tempel manual');
    let pdf = await PDFLib.PDFDocument.load(pdfBytes);
    const jumlahHalaman = pdf.getPageCount();
    const ukuranGambar = async (aset) => { const i = await sematkan(await PDFLib.PDFDocument.create(), aset); return { width: i.width, height: i.height }; };
    const g = muat(await ukuranGambar(gembok), TATA_LETAK.gembok.lebar, TATA_LETAK.gembok.tinggi);
    const F = TATA_LETAK.footer, f = muat(await ukuranGambar(footer), F.lebar, F.tinggi);
    const q = TATA_LETAK.qr.lebar;
    const butuh = TATA_LETAK.jarakBawahJangkar + Math.max(q, g.height);
    const batasBawah = F.jarakBawah + f.height + TATA_LETAK.celahAtasFooter;
    const skalaHal = new Map(); // halaman → { skala, tx, ty }

    // 1) halaman yang blok TTD-nya terlalu dekat ke bawah: isi halaman diperkecil seragam (titik tetap kiri-atas)
    for (const j of jangkar) {
      if (j.yBawah - butuh >= batasBawah) continue;
      const H = pdf.getPage(j.halaman).getHeight();
      let skala = (H - butuh - batasBawah) / (H - j.yBawah);
      if (skala < TATA_LETAK.skalaMin) {
        throw new Error(`blok TTD di halaman ${j.halaman + 1} terlalu dekat ke bawah; perlu diperkecil ke ${Math.round(skala * 100)}% (batas ${TATA_LETAK.skalaMin * 100}%)`);
      }
      skala = Math.floor(skala * 1000) / 1000;
      const tx = F.x * (1 - skala), ty = H * (1 - skala);
      const p = pdf.getPage(j.halaman);
      // translateContent lalu scaleContent → titik p menjadi skala*p + (tx, ty)
      p.translateContent(tx / skala, ty / skala);
      p.scaleContent(skala, skala);
      skalaHal.set(j.halaman, { skala, tx, ty });
    }
    // simpan & muat ulang, supaya tempelan jadi lapisan terpisah di luar transformasi skala
    if (skalaHal.size) pdf = await PDFLib.PDFDocument.load(await pdf.save());

    // 2) hitung semua posisi, lalu pastikan tidak ada tulisan yang tertimpa sebelum menempel apa pun
    const geser = (t, n) => { const s = skalaHal.get(n); return s ? { ...t, x0: s.skala * t.x0 + s.tx, x1: s.skala * t.x1 + s.tx, y0: s.skala * t.y0 + s.ty, y1: s.skala * t.y1 + s.ty } : t; };
    const teksHal = (n) => teks[n].map((t) => geser(t, n));
    const rencana = jangkar.map((j) => {
      const s = skalaHal.get(j.halaman) || { skala: 1, tx: 0, ty: 0 };
      const x = s.skala * j.x + s.tx, atas = s.skala * j.yBawah + s.ty - TATA_LETAK.jarakBawahJangkar;
      if (x + g.width > pdf.getPage(j.halaman).getWidth()) throw new Error(`gembok keluar dari tepi kanan halaman ${j.halaman + 1}`);
      const kQr = { x0: TATA_LETAK.qr.x, x1: TATA_LETAK.qr.x + q, y0: atas - q, y1: atas };
      const kGembok = { x0: x, x1: x + g.width, y0: atas - g.height, y1: atas };
      cekTabrakan(kQr, teksHal(j.halaman), 'QR code', j.halaman + 1);
      cekTabrakan(kGembok, teksHal(j.halaman), 'Gembok', j.halaman + 1);
      return { j, kQr, kGembok };
    });
    // footer: dari halaman 1 sampai halaman tanda tangan terakhir; lampiran di belakangnya tidak disentuh
    const halFooter = pdf.getPages().slice(0, Math.max(...jangkar.map((j) => j.halaman)) + 1);
    const kFooter = { x0: F.x, x1: F.x + f.width, y0: F.jarakBawah, y1: F.jarakBawah + f.height };
    halFooter.forEach((p, n) => cekTabrakan(kFooter, teksHal(n), 'Footer', n + 1));

    // 3) tempel
    const [iQr, iGembok, iFooter] = [await sematkan(pdf, qr), await sematkan(pdf, gembok), await sematkan(pdf, footer)];
    for (const { j, kQr, kGembok } of rencana) {
      const p = pdf.getPage(j.halaman);
      p.drawImage(iQr, { x: kQr.x0, y: kQr.y0, width: q, height: q });
      p.drawImage(iGembok, { x: kGembok.x0, y: kGembok.y0, ...g });
    }
    for (const p of halFooter) p.drawImage(iFooter, { x: F.x, y: F.jarakBawah, ...f });
    // hanya menggambar di halaman yang ada; jumlah halaman tidak boleh berubah
    if (pdf.getPageCount() !== jumlahHalaman) throw new Error('jumlah halaman berubah');
    const halaman = jangkar.map((j) => j.halaman + 1).join(' & ');
    const catatan = [...skalaHal].map(([n, s]) => `isi halaman ${n + 1} diperkecil ke ${(s.skala * 100).toFixed(1)}% agar muat`).join('; ');
    return { bytes: await pdf.save(), halaman, catatan };
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
      b.nama = n === 1 ? `${dasar}.pdf` : `${dasar} (${n}).pdf`;
    }
  }

  async function prosesSemua(log) {
    const baris = bacaBaris().filter((b) => b.dipilih);
    if (!baris.length) throw new Error('belum ada surat yang dicentang');
    log(`${baris.length} surat dipilih.`);
    const kurang = baris.filter((b) => ['surat', 'qr', 'gembok', 'footer'].some((k) => !b.tautan[k]));
    if (kurang.length) throw new Error(`baris ${kurang.map((b) => b.no).join(', ')} tidak punya semua tautan Surat/QRCode/Logo SE/Footer. Klik "Cek tautan" dan kirim hasilnya ke pembuat skrip.`);

    // 1) unduh semua dulu; gembok/footer di-cache per isi berkas
    const cache = new Map();
    const rapikan = async (url, fn) => {
      const a = await ambil(url, 'gambar');
      const key = await sha(a.bytes);
      if (!cache.has(key)) cache.set(key, a.jenis === 'png' ? a : { bytes: await fn(a.bytes), jenis: 'png' });
      return cache.get(key);
    };
    const qrHash = new Map(), masalah = [];
    for (const b of baris) {
      log(`Mengambil ${b.no}. ${b.perihal.slice(0, 60)}…`);
      try {
        b.pdf = (await ambil(b.tautan.surat, 'pdf')).bytes;
        b.qr = await ambil(b.tautan.qr, 'gambar');
        b.gembok = await rapikan(b.tautan.gembok, rapikanGembok);
        b.footer = await rapikan(b.tautan.footer, rapikanFooter);
        const h = await sha(b.qr.bytes);
        if (qrHash.has(h)) masalah.push(`QR baris ${b.no} sama persis dengan baris ${qrHash.get(h)} (kemungkinan tertukar)`);
        qrHash.set(h, b.no);
      } catch (e) {
        masalah.push(`baris ${b.no}: ${e.message}`);
      }
    }
    if (masalah.length) throw new Error('Dibatalkan, tidak ada surat yang diproses:\n' + masalah.join('\n'));

    // 2) tempel
    beriNama(baris);
    const zip = new JSZip(), laporan = [['no', 'perihal', 'file', 'halaman_ttd', 'status', 'keterangan']];
    let ok = 0;
    for (const b of baris) {
      try {
        const r = await tempel(b.pdf, b.qr, b.gembok, b.footer);
        zip.file(b.nama, r.bytes);
        laporan.push([b.no, b.perihal, b.nama, r.halaman, 'OK', r.catatan]);
        if (r.catatan) log(`Catatan ${b.no}: ${r.catatan}.`);
        ok++;
      } catch (e) {
        laporan.push([b.no, b.perihal, '', '', 'GAGAL', e.message]);
        log(`GAGAL ${b.no}: ${e.message}`);
      }
    }
    const csv = laporan.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    zip.file('laporan.csv', '﻿' + csv);
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `surat-barcode-${new Date().toISOString().slice(0, 10)}.zip`,
    });
    document.body.appendChild(a); a.click(); a.remove();
    log(`Selesai: ${ok}/${baris.length} surat. ZIP sudah diunduh. Nama tiap file = perihal surat; unggah lewat "Kirim Surat" di baris dengan perihal yang sama.`);
  }

  // Diagnostik: tampilkan tautan baris pertama dan jenis berkasnya, untuk menyesuaikan skrip.
  async function cekTautan(log) {
    const b = bacaBaris()[0];
    if (!b) return log('Tidak ada baris surat.');
    log(`Baris ${b.no}: ${b.perihal.slice(0, 60)}`);
    for (const k of Object.keys(LINK)) {
      const url = b.tautan[k];
      if (!url) { log(`  ${k}: TIDAK DITEMUKAN`); continue; }
      try {
        const r = await ambil(url, k === 'surat' ? 'pdf' : 'gambar');
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
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;width:360px;background:#fff;color:#222;' +
      'border:2px solid #f5c400;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);font:13px sans-serif;padding:10px';
    box.innerHTML = '<b>Barcode Massal</b><div style="font-size:12px;color:#555;margin-top:2px">Centang surat di kolom NO, lalu klik tombol kuning.</div><div style="margin:8px 0;display:flex;gap:6px">' +
      '<button data-a="proses" style="flex:1;padding:6px;background:#f5c400;border:0;border-radius:4px;font-weight:bold;cursor:pointer">Centang surat dulu</button>' +
      '<button data-a="cek" style="padding:6px;border:1px solid #999;border-radius:4px;background:#fff;cursor:pointer">Cek tautan</button></div>' +
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
    for (const btn of box.querySelectorAll('button')) {
      btn.onclick = async () => {
        sibuk = true;
        box.querySelectorAll('button').forEach((x) => (x.disabled = true));
        out.textContent = '';
        try {
          await (btn.dataset.a === 'proses' ? prosesSemua(log) : cekTautan(log));
        } catch (e) {
          log('⚠ ' + e.message);
        } finally {
          sibuk = false;
          box.querySelectorAll('button').forEach((x) => (x.disabled = false));
          perbarui();
        }
      };
    }
    // tabel bisa digambar ulang (ganti halaman, cari); pasang lagi kotak centangnya
    pasangCentang(perbarui);
    const tabel = tabelSurat();
    if (tabel) new MutationObserver(() => { pasangCentang(perbarui); perbarui(); }).observe(tabel, { childList: true, subtree: true });
    perbarui();
  }

  panel();
})();
