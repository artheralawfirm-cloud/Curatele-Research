/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CaseData } from "./types";

export const BHP_CASES: CaseData[] = [
  {
    id: 1,
    perkara: "Sengketa Tanah Kewarisan / PMH",
    jumlah: 11731,
    sifat: "Hilir",
    stakeholder: ["PN", "BPN"],
    core: "Keluarga menggugat keabsahan sertifikat tanah waris karena dibaliknama sepihak tanpa persetujuan BHP sebagai Pengampu Pengawas.",
    urgensi: "Sertifikat tanah rawan dibatalkan pengadilan, memicu pembekuan aset produktif keluarga bertahun-tahun serta kerugian material yang masive.",
    filosofis: "Menjaga keadilan distributif agar hak kepemilikan mutlak subjek rentan (anak yatim, lansia di bawah pengampuan) terlindungi dari eksploitasi perdata.",
    sosiologis: "Mencegah perpecahan relasi kekeluargaan antar-generasi dan meminimalkan trauma konflik sosial di lingkungan masyarakat akibat sengketa agraria.",
    yuridis: "Berdasarkan KUH Perdata, setiap pengalihan hak atas tanah pengampu wajib divalidasi dan mendapat persetujuan formal dari Balai Harta Peninggalan.",
    risiko: "Sangat Tinggi",
    penjelasanBhp: "BHP mengevaluasi kelayakan pelepasan hak atas tanah, mencegah transaksi ilegal, dan mengaudit aliran dana agar sepenuhnya untuk kesejahteraan subjek pengampuan."
  },
  {
    id: 2,
    perkara: "Gugatan Pengabaian Boedel Waris",
    jumlah: 2463,
    sifat: "Hilir",
    stakeholder: ["PA"],
    core: "Gugatan antar ahli waris di Pengadilan Agama karena tidak adanya inventarisasi aset yang valid (boedel waris) sejak pewaris wafat.",
    urgensi: "Ahli waris yang dominan menguasai fisik aset secara sepihak, menyembunyikan dokumen, dan menggelapkan hasil sewa/keuntungan usaha keluarga.",
    filosofis: "Perlindungan atas ketetapan takdir kewarisan agar tidak dimanipulasi oleh kekuatan finansial atau posisi kuasa dalam silsilah keluarga.",
    sosiologis: "Menggeser paradigma masyarakat dari budaya klaim subjektif yang konfrontatif menuju administrasi peninggalan yang akuntabel dan harmonis.",
    yuridis: "KUH Perdata mewajibkan pencatatan boedel waris secara resmi. BHP berwenang melakukan inventarisasi aset mandiri jika ahli waris berselisih.",
    risiko: "Tinggi",
    penjelasanBhp: "BHP turun langsung melakukan pencatatan fisik, audit independen, dan penyusunan daftar boedel waris formal yang diakui hukum demi keadilan bersamanya."
  },
  {
    id: 3,
    perkara: "Perselisihan Pelaksanaan Wasiat (Willekeur)",
    jumlah: 248,
    sifat: "Hilir",
    stakeholder: ["PN"],
    core: "Wasiat dipersoalkan oleh ahli waris kandung karena dianggap melanggar mutlak hak mutlak waris (Legitieme Portie) atau dibuat di bawah tekanan.",
    urgensi: "Kehendak terakhir almarhum terancam batal demi hukum, merusak kredibilitas wasiat, dan melahirkan penolakan eksekusi aset oleh notaris.",
    filosofis: "Menghormati otonomi kehendak bebas pewaris (testamen) sekaligus menjaga keseimbangan moral-ekonomi bagi kerabat dekat yang ditinggalkan.",
    sosiologis: "Menghindari rasa dendam mendalam antar anak kandung akibat pembagian harta wasiat yang dinilai tidak transparan selama masa hidup pewaris.",
    yuridis: "Pasal 913 KUH Perdata melindungi Legitieme Portie. BHP berhak menangguhkan pelaporan wasiat melanggar hukum untuk dinegosiasikan ulang.",
    risiko: "Sedang",
    penjelasanBhp: "BHP bertindak sebagai mediator netral, memverifikasi kepatuhan nilai wasiat terhadap hak mutlak (legitimaris), dan mengawasi eksekutor wasiat berlisensi."
  },
  {
    id: 4,
    perkara: "Gugatan Pembatalan Hibah Waktu Sakit",
    jumlah: 121,
    sifat: "Hilir",
    stakeholder: ["PA", "Notaris"],
    core: "Permohonan pembatalan akta hibah keluarga karena dilakukan saat pemberi hibah dalam kondisi pikun (demensia) atau sakit keras di rumah sakit.",
    urgensi: "Rawan manipulasi psikologis (solisitasi ilegal) oleh salah satu pihak yang merawat pemberi hibah untuk menguasai porsi harta terbesar.",
    filosofis: "Menjaga kemurnian niat kebaikan hibah sebagai instrumen cinta kasih, bukan sebagai alat penyelundupan hukum peniadaan hak waris sah.",
    sosiologis: "Membendung kecurigaan antar saudara kandung serta sengketa moral atas tuduhan penelantaran orang tua demi harta warisan.",
    yuridis: "Syarat sah perjanjian perdata menuntut kecakapan bertindak hukum (mental yang sehat). Hibah tanpa supervisi medis akurat rawan batal.",
    risiko: "Sedang",
    penjelasanBhp: "BHP memvalidasi riwayat kecakapan hukum pemberi hibah dan memberikan catatan pelindung pra-transaksi guna meminimalisir potensi gugatan di kemudian hari."
  },
  {
    id: 5,
    perkara: "Sengketa Pengalihan Aset Afwezigheid",
    jumlah: 8,
    sifat: "Hilir",
    stakeholder: ["PN", "BHP"],
    core: "Pengalihan aset milik orang hilang (afwezigheid/tidak hadir) secara ilegal oleh pihak ketiga tanpa persetujuan perwakilan berkekuatan hukum.",
    urgensi: "Aset terbengkalai, diserobot mafioso properti, atau dicairkan secara sepihak oleh debitur/rekan bisnis tanpa sepengetahuan ahli waris.",
    filosofis: "Kehadiran representasi negara dalam menjaga keutuhan hak perdata warga negara yang tidak mampu membela kepentingannya sendiri secara fisik.",
    sosiologis: "Memberikan kepastian hukum dan ketenangan bagi keluarga yang ditinggalkan agar tetap memperoleh nafkah dari kelolaan aset afwezigheid.",
    yuridis: "Pasal 463 KUH Perdata menegaskan Balai Harta Peninggalan sebagai Pengampu Pengawas resmi harta peninggalan orang yang dinyatakan tidak hadir.",
    risiko: "Rendah",
    penjelasanBhp: "BHP mengambil alih manajemen pengurusan aset afwezigheid secara resmi, mengamankan nilai ekonominya, dan menyalurkannya kepada ahli waris sah."
  },
  {
    id: 6,
    perkara: "Permohonan Pengampuan Pengawas (Curatela)",
    jumlah: 850,
    sifat: "Hulu",
    stakeholder: ["PN", "BHP"],
    core: "Inisiasi preventif mendaftarkan pengampuan bagi anggota keluarga yang kehilangan kecakapan mental guna mengamankan aset dari penipuan luar.",
    urgensi: "Langkah mendesak sebelum aset disalahgunakan oleh pihak eksternal atau dijual murah untuk kepentingan konsumtif wali pengampuan sepihak.",
    filosofis: "Filosofi 'parens patriae'—negara sebagai pelindung tertinggi bagi rakyat yang termarjinalisasi secara mental dan fisik.",
    sosiologis: "Menghapus stigma negatif curatela di masyarakat, mempromosikannya sebagai wujud cinta kasih dan tameng pelindung finansial keluarga.",
    yuridis: "Undang-Undang mengharuskan penetapan pengadilan negeri, di mana Balai Harta Peninggalan wajib ditunjuk sebagai Pengampu Pengawas resmi.",
    risiko: "Preventif",
    penjelasanBhp: "BHP secara berkala mengaudit laporan keuangan dari pengampu utama, memverifikasi penggunaan dana aset, dan memastikan kelayakan hidup terampu."
  },
  {
    id: 7,
    perkara: "Pencatatan Boedel Waris Preventif",
    jumlah: 74,
    sifat: "Hulu",
    stakeholder: ["PN", "BHP"],
    core: "Pendaftaran, penyegelan, dan pencatatan sukarela boedel waris di hulu oleh pemilik sebelum terjadi perselisihan atau penurunan kesadaran.",
    urgensi: "Mencegah klaim fiktif ahli waris di masa depan, mempercepat penyelesaian pembagian waris tanpa melalui drama pengadilan perdata.",
    filosofis: "Prinsip perdamaian mendahului perselisihan (preventive justice) demi melestarikan kedamaian keluarga serta ketertiban hukum nasional.",
    sosiologis: "Membangun budaya melek administrasi hukum warisan sejak dini, mereduksi beban perkara di lembaga pengadilan negeri.",
    yuridis: "Pencatatan resmi oleh BHP menghasilkan dokumen akta otentik yang memiliki kekuatan pembuktian sempurna di mata majelis hakim.",
    risiko: "Preventif",
    penjelasanBhp: "BHP memfasilitasi pembuatan akta pencatatan aset otentik secara transparan, aman dari manipulasi pihak luar, dan melayani mediasi pra-waris."
  }
];

export const SH_LIST = ["Semua", "PN", "PA", "BPN", "Notaris", "BHP"];

export const RISK_COLOR = {
  "Sangat Tinggi": "#DC2626", // Red 600
  "Tinggi": "#EA580C",        // Orange 600
  "Sedang": "#D97706",        // Amber 600
  "Rendah": "#16A34A",        // Green 600
  "Preventif": "#2563EB"       // Blue 600
};

export const RISK_BG_LIGHT = {
  "Sangat Tinggi": "#FEF2F2", // Red 50
  "Tinggi": "#FFF7ED",        // Orange 50
  "Sedang": "#FFFBEB",        // Amber 50
  "Rendah": "#F0FDF4",        // Green 50
  "Preventif": "#EFF6FF"       // Blue 50
};

export const RISK_BG_DARK = {
  "Sangat Tinggi": "#451A03", // custom dark variants
  "Tinggi": "#3F1802",
  "Sedang": "#3A1B02",
  "Rendah": "#022C22",
  "Preventif": "#172554"
};
