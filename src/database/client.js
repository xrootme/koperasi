import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const credentialsPath = process.env.GOOGLE_SHEET_CREDENTIALS;
const spreadsheetId = process.env.GOOGLE_SHEET_ID;

if (!credentialsPath) {
  throw new Error("GOOGLE_SHEET_CREDENTIALS belum diisi di .env");
}

if (!spreadsheetId) {
  throw new Error("GOOGLE_SHEET_ID belum diisi di .env");
}

const auth = new google.auth.GoogleAuth({
  keyFile: credentialsPath,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

export const sheets = google.sheets({
  version: "v4",
  auth,
});

export { spreadsheetId };