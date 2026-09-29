import "dotenv/config";
import { getSheetsClient } from "./src/services/sheets.js";
import { config } from "./src/config/index.js";

const SHEET_ID = config.google.sheetId;

async function getSheetNames(sheets) {
  const res = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  return (res.data.sheets || [])
    .map((s) => s.properties?.title)
    .filter(Boolean);
}

async function clearSheet(sheets, name) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `'${name}'!A:Z`,
  });
  console.log(`✓ ${name} dikosongkan`);
}

async function cleanSheets() {
  console.log("\n=================================");
  console.log("       CLEAN GOOGLE SHEETS");
  console.log("=================================\n");

  const sheets = getSheetsClient();

  const names = await getSheetNames(sheets);

  if (!names.length) {
    console.log("Tidak ada sheet.");
    return;
  }

  console.log("Sheet ditemukan:");
  names.forEach((n) => console.log(`- ${n}`));
  console.log("");

  for (const name of names) {
    try {
      await clearSheet(sheets, name);
    } catch (e) {
      console.error(`✗ ${name} gagal:`, e?.response?.data?.error?.message || e.message);
    }
  }

  console.log("\n=================================");
  console.log("       CLEAN SELESAI");
  console.log("=================================\n");
}

cleanSheets().catch((err) => {
  console.error("\n❌ CLEAN GAGAL");
  console.error(err?.response?.data?.error?.message || err.message || err);
  process.exit(1);
});
