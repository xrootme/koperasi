import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { config } from "../config/index.js";

let _sheets = null;
let _auth = null;

export function getSheetsClient() {
  if (_sheets) return _sheets;

  if (!config.google.sheetId) {
    throw new Error("GOOGLE_SHEET_ID is not configured");
  }

  const credentialPath = path.resolve(process.cwd(), config.google.credentialsPath);

  if (!fs.existsSync(credentialPath) || fs.statSync(credentialPath).isDirectory()) {
    throw new Error(`Google credentials file not found at: ${credentialPath}`);
  }

  let credentials;
  try {
    const raw = fs.readFileSync(credentialPath, "utf8");
    credentials = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in credentials file: ${credentialPath}`);
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Invalid credentials: missing client_email or private_key");
  }

  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");

  _auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  _sheets = google.sheets({
    version: "v4",
    auth: _auth,
  });

  return _sheets;
}

export function resetSheetsClient() {
  _sheets = null;
  _auth = null;
  _tabNames = null;
}

let _tabNames = null;

async function loadTabNames() {
  if (_tabNames) return _tabNames;

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: config.google.sheetId,
  });

  _tabNames = (res.data.sheets || [])
    .map((s) => s.properties?.title)
    .filter(Boolean);

  return _tabNames;
}

export async function getActualTabName(sheetName) {
  if (typeof sheetName !== "string" || !sheetName.trim()) {
    throw new TypeError(`Tab name must be a string, got ${typeof sheetName}`);
  }

  const target = sheetName.trim();
  const tabs = await loadTabNames();

  const exact = tabs.find((t) => t === target);
  if (exact) return exact;

  const loose = tabs.find(
    (t) => t.trim().toUpperCase() === target.toUpperCase(),
  );
  if (loose) return loose;

  return null;
}

export async function readSheet(sheetName, range = "A:Z") {
  if (typeof sheetName !== "string" || !sheetName.trim()) {
    throw new TypeError(
      `readSheet() requires a sheet name string, got ${typeof sheetName}. ` +
        `Call it as readSheet(SHEET_ANGGOTA), not readSheet(client, SHEET_ANGGOTA).`,
    );
  }

  const actualName = (await getActualTabName(sheetName)) || sheetName;

  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId,
    range: `'${actualName}'!${range}`,
  });

  const rows = response.data.values || [];

  if (!rows.length) {
    return { headers: [], data: [] };
  }

  const headers = rows[0].map((h) => String(h || "").trim());
  const data = rows.slice(1).map((row, index) => {
    const obj = { __rowNumber: index + 2 };
    headers.forEach((header, colIndex) => {
      obj[header] = row[colIndex] ?? "";
    });
    return obj;
  });

  return { headers, data };
}

export async function getHeaders(sheetName) {
  const { headers } = await readSheet(sheetName, "1:1");
  return headers;
}

export async function appendRow(sheetName, rowData) {
  const actualName = (await getActualTabName(sheetName)) || sheetName;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.sheetId,
    range: `'${actualName}'!A:Z`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [rowData] },
  });
}

export async function appendRows(sheetName, rowsData) {
  if (!rowsData.length) return;

  const actualName = (await getActualTabName(sheetName)) || sheetName;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.sheetId,
    range: `'${actualName}'!A:Z`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rowsData },
  });
}

export async function updateCell(sheetName, rowNumber, columnLetter, value) {
  const actualName = (await getActualTabName(sheetName)) || sheetName;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.sheetId,
    range: `'${actualName}'!${columnLetter}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

export async function batchUpdate(sheetName, updates) {
  const actualName = (await getActualTabName(sheetName)) || sheetName;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config.google.sheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: updates.map((u) => ({
        range: `'${actualName}'!${u.range}`,
        values: u.values,
      })),
    },
  });
}

export {
  columnLetter,
  findHeaderIndex,
  findHeader,
  clean,
  cleanUpper,
  normalizeNumber,
  toNumber,
  formatRupiah,
} from "../utils/numbers.js";