import "dotenv/config";
import { getSheetsClient, getHeaders, getActualTabName } from "./src/services/sheets.js";

const targets = process.argv.slice(2);

for (const name of targets) {
  const tab = await getActualTabName(name);
  if (!tab) {
    console.log(`${name}: tab tidak ditemukan`);
    continue;
  }

  const headers = await getHeaders(name);
  console.log("=".repeat(60));
  console.log(`TAB: "${tab}"  (diminta sebagai ${name})`);
  console.log("=".repeat(60));
  console.log("header:");
  headers.forEach((h, i) => console.log(`  ${String.fromCharCode(65 + i)}  "${h}"`));

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `'${tab}'!A1:Z6`,
  });
  const rows = res.data.values || [];

  console.log("");
  console.log("isi (5 baris pertama):");
  for (const row of rows) {
    console.log("  " + row.map((c) => String(c ?? "").slice(0, 14)).join(" | "));
  }
  console.log("");
}
