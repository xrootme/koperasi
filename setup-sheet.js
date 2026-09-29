import "dotenv/config";
import { HEADERS, STATUS, HARI_LIST, KELOMPOK_BY_HARI } from "./src/config/sheetSchema.js";
import {
  getSheetsClient,
  getHeaders,
  getActualTabName,
  resetSheetsClient,
} from "./src/services/sheets.js";
import { config } from "./src/config/index.js";

const spreadsheetId = config.google.sheetId;

const args = process.argv.slice(2);
const FIX_HEADERS = args.includes("--fix");
const FORCE_SAMPLE = args.includes("--force-sample");

function sampleData() {
  return {
    ANGGOTA: [
      HEADERS.ANGGOTA,
      ["AGT001", "TEST ANGGOTA", "089648330675", "-", "04-09-2026", "KLP001", "SENIN", STATUS.ANGGOTA_AKTIF],
    ],
    PINJAMAN: [
      HEADERS.PINJAMAN,
      ["PJM001", "AGT001", "04-09-2026", 500000, 10, 150000, 650000, STATUS.PINJAMAN_BERJALAN],
    ],
    ANGSURAN: [
      HEADERS.ANGSURAN,
      ...Array.from({ length: 10 }, (_, i) => [
        `AGR${String(i + 1).padStart(3, "0")}`,
        "PJM001",
        "AGT001",
        i + 1,
        `0${Math.min(9, 4 + i)}-09-2026`,
        65000,
        0,
        65000,
        STATUS.ANGSURAN_BELUM,
        "",
      ]),
    ],
    PEMBAYARAN: [HEADERS.PEMBAYARAN],
    KELOMPOK_HARI: [
      HEADERS.KELOMPOK_HARI,
      ...HARI_LIST.map((hari) => [
        KELOMPOK_BY_HARI[hari],
        hari,
        "08:00",
        STATUS.ANGGOTA_AKTIF,
        `Kelompok ${hari}`,
      ]),
    ],
  };
}

async function getSheetMap() {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const map = new Map();
  for (const s of res.data.sheets || []) {
    map.set(s.properties?.title, s.properties?.sheetId);
  }
  return map;
}

async function resolveTab(name) {
  return (await getActualTabName(name)) || name;
}

async function createMissingSheets() {
  const sheets = getSheetsClient();

  for (const name of Object.keys(HEADERS)) {
    const existing = await getActualTabName(name);

    if (existing) {
      if (existing !== name) {
        console.log(`  - ${name}: pakai tab "${existing}" (beda kapital, tidak perlu rename)`);
      } else {
        console.log(`  - ${name}: sudah ada`);
      }
      continue;
    }

    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: name } } }] },
      });
      console.log(`  + ${name}: dibuat`);
    } catch (error) {
      const message =
        error?.response?.data?.error?.message || error.message || "";

      if (/already exists/i.test(message)) {
        console.log(`  - ${name}: sudah ada (dicek server)`);
        continue;
      }
      throw error;
    }
  }

  resetSheetsClient();
}

async function writeHeaders(sheetName) {
  const target = await resolveTab(sheetName);
  const expected = HEADERS[sheetName];

  let before = [];
  try {
    before = await getHeaders(sheetName);
  } catch {
    before = [];
  }

  const junk = before.slice(expected.length);

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${target}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [expected] },
  });

  if (junk.length) {
    const firstJunk = String.fromCharCode(65 + expected.length);
    const lastJunk = String.fromCharCode(64 + before.length);
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${target}'!${firstJunk}1:${lastJunk}1`,
    });

    const stillThere = (await getHeaders(sheetName)).slice(expected.length);
    if (stillThere.length) {
      console.log(
        `      (kolom ${firstJunk}1 tidak bisa dikosongkan, kemungkinan ada script/editor lain yang mengisinya lagi: ${stillThere.join(", ")} - tidak berbahaya, program membaca per nama kolom)`,
      );
    } else {
      console.log(`      (kolom sampah dibersihkan: ${junk.join(", ")})`);
    }
  }
}

async function writeSample(sheetName, rows) {
  const target = await resolveTab(sheetName);
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${target}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
}

async function appendSampleRow(sheetName, values) {
  const target = await resolveTab(sheetName);
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${target}'!A:Z`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });
}

async function hasData(sheetName) {
  try {
    const rows = await getHeaders(sheetName);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function formatHeaders(sheetMap) {
  const sheets = getSheetsClient();

  for (const [title, sheetId] of sheetMap) {
    const key = Object.keys(HEADERS).find(
      (k) => k === title || k.toUpperCase() === String(title).trim().toUpperCase(),
    );
    if (!key) continue;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
          {
            autoResizeDimensions: {
              dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: HEADERS[key].length },
            },
          },
        ],
      },
    });
  }
}

async function setup() {
  console.log("");
  console.log("=================================");
  console.log("     SETUP GOOGLE SHEETS");
  console.log("=================================");

  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID belum diisi di .env");

  console.log("Spreadsheet:", spreadsheetId);
  console.log("Credentials:", config.google.credentialsPath);
  console.log("");

  console.log("1. Mengecek sheet...");
  await createMissingSheets();

  console.log("");
  console.log("2. Menyamakan header dengan skema program...");

  for (const name of Object.keys(HEADERS)) {
    const expected = HEADERS[name];
    const actualTab = await resolveTab(name);

    if (FIX_HEADERS) {
      await writeHeaders(name);
      console.log(`  = ${name}: header ditulis ke "${actualTab}"`);
      continue;
    }

    let actual = [];
    try {
      actual = await getHeaders(name);
    } catch {
      actual = [];
    }

    if (actual.length === 0) {
      await writeHeaders(name);
      console.log(`  + ${name}: header baru dibuat di "${actualTab}"`);
    } else if (actual.join("|") !== expected.join("|")) {
      const missing = expected.filter((h) => !actual.includes(h));
      const extra = actual.filter((h) => !expected.includes(h));
      console.log(`  ! ${name} (tab "${actualTab}"): header berbeda`);
      if (missing.length) console.log(`      hilang: ${missing.join(", ")}`);
      if (extra.length) console.log(`      tidak dikenal: ${extra.join(", ")}`);
      console.log(`      jalankan: npm run setup -- --fix`);
    } else {
      console.log(`  = ${name}: header sudah sesuai`);
    }
  }

  console.log("");
  console.log("3. Mengisi data contoh...");

  const samples = sampleData();
  for (const [name, rows] of Object.entries(samples)) {
    const populated = await hasData(name);
    if (populated && !FORCE_SAMPLE) {
      console.log(`  - ${name}: sudah ada data, dilewati`);
      continue;
    }
    if (populated && FORCE_SAMPLE) {
      await appendSampleRow(name, rows[1]);
      console.log(`  + ${name}: contoh ditambahkan (data lama dipertahankan)`);
      continue;
    }
    await writeSample(name, rows);
    console.log(`  + ${name}: contoh ditulis`);
  }

  console.log("");
  console.log("4. Format header...");
  await formatHeaders(await getSheetMap());
  console.log("  header tebal + kolom auto-resize");

  console.log("");
  console.log("=================================");
  console.log("       SETUP SELESAI");
  console.log("=================================");
  console.log("");
  console.log("Perintah:");
  console.log("  npm run setup              - buat sheet + cek header");
  console.log("  npm run setup -- --fix     - TIMPA header ke skema benar");
  console.log("  npm run setup -- --force-sample  - tambah 1 baris contoh");
  console.log("");
  console.log("PENTING: spreadsheet harus dibagikan ke email service account");
  console.log("dengan hak Editor, jika tidak semua fitur akan gagal.");
  console.log("");
}

setup().catch((error) => {
  console.error("");
  console.error("SETUP GAGAL");
  console.error(error?.response?.data?.error?.message || error.message || error);
  process.exit(1);
});
