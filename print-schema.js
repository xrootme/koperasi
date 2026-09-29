/**
 * Menampilkan struktur sheet yang dibutuhkan program, dalam bentuk
 * siap salin ke Google Sheets.
 *
 * Jalankan: node print-schema.js
 */

import { HEADERS, STATUS, HARI_LIST, KELOMPOK_BY_HARI } from "./src/config/sheetSchema.js";

const pad = (s, n) => String(s).padEnd(n);

console.log("");
console.log("=".repeat(70));
console.log("  STRUKTUR GOOGLE SHEETS UNTUK BOT KOPERASI");
console.log("=".repeat(70));
console.log("");

const WIDTH = {};
for (const [sheet, headers] of Object.entries(HEADERS)) {
  WIDTH[sheet] = Math.max(...headers.map((h) => h.length), 12);
}

for (const [sheet, headers] of Object.entries(HEADERS)) {
  console.log("-".repeat(70));
  console.log(`SHEET: ${sheet}`);
  console.log("-".repeat(70));
  headers.forEach((h, i) => {
    console.log(`  ${pad(String.fromCharCode(65 + i), 3)} ${pad(h, WIDTH[sheet])}`);
  });
  console.log("");
}

console.log("=".repeat(70));
console.log("  NILAI YANG DITERIMA PROGRAM");
console.log("=".repeat(70));
console.log("");
console.log(`STATUS anggota      : ${STATUS.ANGGOTA_AKTIF}`);
console.log(`STATUS pinjaman     : ${STATUS.PINJAMAN_BERJALAN} | ${STATUS.PINJAMAN_LUNAS}`);
console.log(`STATUS angsuran     : ${STATUS.ANGSURAN_BELUM} | ${STATUS.ANGSURAN_LUNAS}`);
console.log(`HARI tagihan        : ${HARI_LIST.join(" | ")}`);
console.log(`MINGGU              : 1..TENOR (angka)`);
console.log(`NO WA               : bebas format (08xx / 62xx / +62xx), WAJIB diawali 62`);
console.log("");

console.log("=".repeat(70));
console.log("  CONTOH ISI");
console.log("=".repeat(70));
console.log("");

console.log("ANGGOTA:");
console.log(
  "  " +
    HEADERS.ANGGOTA.map((h) => pad(h, 14)).join(""),
);
console.log(
  "  " +
    [
      "AGT001",
      "Budi Santoso",
      "628123456789",
      "Jl. Merdeka 1",
      "01-10-2026",
      "KLP001",
      "SENIN",
      "AKTIF",
    ]
      .map((v) => pad(v, 14))
      .join(""),
);
console.log("");

console.log("PINJAMAN:");
console.log("  " + HEADERS.PINJAMAN.map((h) => pad(h, 15)).join(""));
console.log(
  "  " +
    ["PJM001", "AGT001", "01-10-2026", 1000000, 10, 300000, 1300000, "BERJALAN"]
      .map((v) => pad(v, 15))
      .join(""),
);
console.log("");

console.log("ANGSURAN (1 angsuran per minggu, satu baris per minggu):");
console.log("  " + HEADERS.ANGSURAN.map((h) => pad(h, 15)).join(""));
for (let w = 1; w <= 3; w++) {
  console.log(
    "  " +
      [
        `AGR${String(w).padStart(3, "0")}`,
        "PJM001",
        "AGT001",
        w,
        `0${9 + Math.floor(w / 4)}-${String((w * 7) % 28 + 1).padStart(2, "0")}-2026`,
        130000,
        0,
        130000,
        "BELUM DIBAYAR",
        "",
      ]
        .map((v) => pad(v, 15))
        .join(""),
  );
}
console.log("  ... (ulangi sampai TENOR)");
console.log("");

console.log("=".repeat(70));
console.log("  LANGKAH");
console.log("=".repeat(70));
console.log("");
console.log("1. Buat spreadsheet di Google Sheets");
console.log("2. Buat 5 tab: ANGGOTA, PINJAMAN, ANGSURAN, PEMBAYARAN, KELOMPOK_HARI");
console.log("3. Salin header di atas ke baris 1 tiap tab (HURUS PERSIS, huruf besar)");
console.log("4. Share spreadsheet ke email service account sebagai Editor");
console.log("5. Taruh file credentials di ./credentials/google-service-account.json");
console.log("6. Jalankan: npm start");
console.log("");
console.log("Atau biarkan program yang buat otomatis:");
console.log("  npm run setup            -> buat tab + isi contoh");
console.log("  npm run setup -- --fix   -> timpa header ke skema di atas");
console.log("");
