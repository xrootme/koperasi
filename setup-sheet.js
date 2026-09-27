import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SHEET_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({
  version: "v4",
  auth,
});

const spreadsheetId = process.env.GOOGLE_SHEET_ID;

const sheetData = {
  ANGGOTA: [
    [
      "USER ID",
      "NAMA",
      "NO WA",
      "ALAMAT",
      "TGL DAFTAR",
      "KELOMPOK ID",
      "HARI TAGIHAN",
      "STATUS",
    ],
    [
      "AGT001",
      "TEST ANGGOTA",
      "089648330675",
      "-",
      "04-09-2026",
      "KLP001",
      "SENIN",
      "AKTIF",
    ],
  ],

  PINJAMAN: [
    [
      "PINJAMAN ID",
      "USER ID",
      "TGL PINJAMAN",
      "POKOK",
      "TENOR",
      "BUNGA",
      "TOTAL TAGIHAN",
      "STATUS",
    ],
    ["PJM001", "AGT001", "04-09-2026", 500000, 10, 150000, 650000, "BERJALAN"],
  ],

  ANGSURAN: [
    [
      "ANGSURAN ID",
      "PINJAMAN ID",
      "USER ID",
      "MINGGU",
      "JATUH TEMPO",
      "TAGIHAN",
      "DIBAYAR",
      "SISA",
      "STATUS",
    ],
    ["AGR001", "PJM001", "AGT001", 1, "07-09-2026", 65000, 0, 65000, "BELUM"],
    ["AGR002", "PJM001", "AGT001", 2, "14-09-2026", 65000, 0, 65000, "BELUM"],
    ["AGR003", "PJM001", "AGT001", 3, "21-09-2026", 65000, 0, 65000, "BELUM"],
    ["AGR004", "PJM001", "AGT001", 4, "28-09-2026", 65000, 0, 65000, "BELUM"],
    ["AGR005", "PJM001", "AGT001", 5, "05-10-2026", 65000, 0, 65000, "BELUM"],
    ["AGR006", "PJM001", "AGT001", 6, "12-10-2026", 65000, 0, 65000, "BELUM"],
    ["AGR007", "PJM001", "AGT001", 7, "19-10-2026", 65000, 0, 65000, "BELUM"],
    ["AGR008", "PJM001", "AGT001", 8, "26-10-2026", 65000, 0, 65000, "BELUM"],
    ["AGR009", "PJM001", "AGT001", 9, "02-11-2026", 65000, 0, 65000, "BELUM"],
    ["AGR010", "PJM001", "AGT001", 10, "09-11-2026", 65000, 0, 65000, "BELUM"],
  ],

  PEMBAYARAN: [
    [
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
  ],

  KELOMPOK_HARI: [
    ["KELOMPOK ID", "HARI", "JAM BROADCAST", "STATUS", "KETERANGAN"],
    ["KLP001", "SENIN", "08:00", "AKTIF", "Kelompok Senin"],
    ["KLP002", "SELASA", "08:00", "AKTIF", "Kelompok Selasa"],
    ["KLP003", "RABU", "08:00", "AKTIF", "Kelompok Rabu"],
    ["KLP004", "KAMIS", "08:00", "AKTIF", "Kelompok Kamis"],
    ["KLP005", "JUMAT", "08:00", "AKTIF", "Kelompok Jumat"],
    ["KLP006", "SABTU", "08:00", "AKTIF", "Kelompok Sabtu"],
  ],
};

async function getSpreadsheet() {
  return await sheets.spreadsheets.get({
    spreadsheetId,
  });
}

async function getSheetMap() {
  const spreadsheet = await getSpreadsheet();

  const map = new Map();

  for (const sheet of spreadsheet.data.sheets || []) {
    const title = sheet.properties?.title;
    const sheetId = sheet.properties?.sheetId;

    if (title) {
      map.set(title, sheetId);
    }
  }

  return map;
}

async function createMissingSheets() {
  let sheetMap = await getSheetMap();

  for (const sheetName of Object.keys(sheetData)) {
    if (sheetMap.has(sheetName)) {
      console.log(`✓ Sheet ${sheetName} sudah ada`);
      continue;
    }

    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });

      console.log(`✓ Sheet ${sheetName} berhasil dibuat`);

      // Refresh daftar sheet setelah membuat
      sheetMap = await getSheetMap();
    } catch (error) {
      const message =
        error?.response?.data?.error?.message || error.message || "";

      // Jika ternyata sudah ada, jangan dianggap fatal
      if (
        message.includes("already exists") ||
        message.includes("already exist")
      ) {
        console.log(`✓ Sheet ${sheetName} sudah ada`);
        continue;
      }

      throw error;
    }
  }
}

async function getSheetValues(sheetName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:Z`,
  });

  return response.data.values || [];
}

async function writeOnlyIfEmpty(sheetName, values) {
  const existing = await getSheetValues(sheetName);

  if (existing.length > 0) {
    console.log(`↳ ${sheetName}: sudah memiliki data, dilewati`);
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values,
    },
  });

  console.log(`✓ Data ${sheetName} berhasil diisi`);
}

async function formatHeader(sheetName) {
  const sheetMap = await getSheetMap();

  const sheetId = sheetMap.get(sheetName);

  if (sheetId === undefined) {
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  bold: true,
                },
              },
            },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: 12,
            },
          },
        },
      ],
    },
  });

  console.log(`✓ Format ${sheetName} selesai`);
}

async function setup() {
  console.log("");
  console.log("=================================");
  console.log("     SETUP GOOGLE SHEETS");
  console.log("=================================");
  console.log("");

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEET_ID belum diisi di .env");
  }

  if (!process.env.GOOGLE_SHEET_CREDENTIALS) {
    throw new Error("GOOGLE_SHEET_CREDENTIALS belum diisi di .env");
  }

  console.log("Spreadsheet ID:");
  console.log(spreadsheetId);
  console.log("");

  console.log("1. Mengecek sheet...");
  await createMissingSheets();

  console.log("");

  console.log("2. Mengisi data...");
  for (const [sheetName, values] of Object.entries(sheetData)) {
    await writeOnlyIfEmpty(sheetName, values);
  }

  console.log("");

  console.log("3. Format header...");
  for (const sheetName of Object.keys(sheetData)) {
    await formatHeader(sheetName);
  }

  console.log("");
  console.log("=================================");
  console.log("       SETUP SELESAI");
  console.log("=================================");
  console.log("");

  console.log("Test anggota : AGT001");
  console.log("WhatsApp     : 0895634117345");
  console.log("Pinjaman     : PJM001");
  console.log("Pokok        : Rp500.000");
  console.log("Angsuran     : Rp65.000 / minggu");
  console.log("Tenor        : 10 minggu");
  console.log("Hari tagihan : SENIN");
  console.log("");
}

setup().catch((error) => {
  console.error("");
  console.error("❌ SETUP GAGAL");
  console.error("");

  console.error(
    error?.response?.data?.error?.message || error.message || error,
  );

  process.exit(1);
});
