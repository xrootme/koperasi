import "dotenv/config";
import { getSheetsClient } from "./src/services/sheets.js";

const spreadsheetId = process.env.GOOGLE_SHEET_ID;

const sheets = getSheetsClient();
const res = await sheets.spreadsheets.get({ spreadsheetId });

console.log("Spreadsheet ID :", spreadsheetId);
console.log("Spreadsheet nama:", res.data.properties?.title);
console.log("Total tab      :", res.data.sheets?.length);
console.log("");

console.log("TAB YANG ADA (tanda kurung = ada spasi tersembunyi):");
for (const s of res.data.sheets || []) {
  const title = s.properties?.title || "";
  const marker = title === title.trim() ? "" : "  <-- ADA SPASI AWAL/AKHIR!";
  console.log(
    `  [${String(s.properties?.sheetId).padStart(3)}] "${title}"${marker}  rows=${s.properties?.gridProperties?.rowCount}`,
  );
}

console.log("");
console.log("Perbandingan dengan yang dibutuhkan program:");

const { HEADERS } = await import("./src/config/sheetSchema.js");

for (const name of Object.keys(HEADERS)) {
  const match = (res.data.sheets || []).find((s) => s.properties?.title === name);
  const loose = (res.data.sheets || []).find(
    (s) => s.properties?.title?.trim().toUpperCase() === name,
  );

  if (match) {
    console.log(`  OK       ${name}`);
  } else if (loose) {
    console.log(`  ZONA     ${name} -> tabclosest: "${loose.properties.title}" (beda kapital/spasi)`);
  } else {
    console.log(`  HILANG   ${name}`);
  }
}
