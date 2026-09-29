/**
 * Single source of truth for Google Sheets structure.
 *
 * Both the bot (runtime reads) and setup-sheet.js (bootstrap) must agree.
 * Changing a column name here changes it everywhere.
 *
 * Column names here are the CANONICAL names. Runtime code also accepts
 * aliases via findHeader()/findHeaderIndex() for older spreadsheets.
 */

export const HEADERS = {
  ANGGOTA: [
    "USER ID",
    "NAMA",
    "NO WA",
    "ALAMAT",
    "TGL DAFTAR",
    "KELOMPOK ID",
    "HARI TAGIHAN",
    "STATUS",
  ],

  PINJAMAN: [
    "PINJAMAN ID",
    "USER ID",
    "TANGGAL PINJAMAN",
    "POKOK",
    "TENOR",
    "BUNGA",
    "TOTAL TAGIHAN",
    "STATUS",
  ],

  ANGSURAN: [
    "ANGSURAN ID",
    "PINJAMAN ID",
    "USER ID",
    "MINGGU",
    "JATUH TEMPO",
    "TAGIHAN",
    "DIBAYAR",
    "SISA",
    "STATUS",
    "TANGGAL PEMBAYARAN",
  ],

  PEMBAYARAN: [
    "PAYMENT ID",
    "USER ID",
    "PINJAMAN ID",
    "MINGGU",
    "NOMINAL",
    "TANGGAL",
    "METODE",
    "STATUS",
    "KETERANGAN",
  ],

  KELOMPOK_HARI: ["KELOMPOK ID", "HARI", "JAM BROADCAST", "STATUS", "KETERANGAN"],
};

export const STATUS = {
  ANGGOTA_AKTIF: "AKTIF",
  PINJAMAN_BERJALAN: "BERJALAN",
  PINJAMAN_LUNAS: "LUNAS",
  ANGSURAN_BELUM: "BELUM DIBAYAR",
  ANGSURAN_LUNAS: "SUDAH DIBAYAR",
};

export const HARI_LIST = [
  "SENIN",
  "SELASA",
  "RABU",
  "KAMIS",
  "JUMAT",
  "SABTU",
];

export const KELOMPOK_BY_HARI = {
  SENIN: "KLP001",
  SELASA: "KLP002",
  RABU: "KLP003",
  KAMIS: "KLP004",
  JUMAT: "KLP005",
  SABTU: "KLP006",
};
