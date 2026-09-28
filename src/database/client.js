import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

let _sheets = null;
let _auth = null;

export function getSpreadsheetId() {
  return process.env.GOOGLE_SHEET_ID || "";
}

export function getCredentialsPath() {
  const credPath = process.env.GOOGLE_SHEET_CREDENTIALS;
  if (!credPath || !String(credPath).trim()) {
    throw new Error("GOOGLE_SHEET_CREDENTIALS belum diisi di .env");
  }
  return path.resolve(process.cwd(), credPath);
}

export function ensureSheetsClient() {
  if (_sheets) return _sheets;

  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEET_ID belum diisi di .env");
  }

  const credentialPath = getCredentialsPath();
  if (!fs.existsSync(credentialPath) || fs.statSync(credentialPath).isDirectory()) {
    throw new Error(`File credential Google tidak ditemukan di: ${credentialPath}`);
  }

  _auth = new google.auth.GoogleAuth({
    keyFile: credentialPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  _sheets = google.sheets({
    version: "v4",
    auth: _auth,
  });

  return _sheets;
}

// Proxy wrapper agar pemanggilan `sheets.spreadsheets...` dievaluasi saat runtime (lazy)
export const sheets = new Proxy({}, {
  get(target, prop) {
    const client = ensureSheetsClient();
    const val = client[prop];
    return typeof val === "function" ? val.bind(client) : val;
  }
});

// Dynamic spreadsheet ID
export const spreadsheetId = {
  toString() {
    return getSpreadsheetId();
  },
  valueOf() {
    return getSpreadsheetId();
  },
  [Symbol.toPrimitive]() {
    return getSpreadsheetId();
  }
};