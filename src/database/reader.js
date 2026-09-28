import { sheets, getSpreadsheetId } from "./client.js";
import { clean } from "./helpers.js";

export async function getRows(sheetName) {
  const sid = getSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `'${sheetName}'!A:Z`,
  });

  const rows = response.data.values || [];

  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map((header) => clean(header));

  return rows.slice(1).map((row, index) => {
    const obj = {};

    headers.forEach((header, columnIndex) => {
      obj[header] = row[columnIndex] ?? "";
    });

    obj.__rowNumber = index + 2;

    return obj;
  });
}

export async function getHeaders(sheetName) {
  const sid = getSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `'${sheetName}'!1:1`,
  });

  return (response.data.values?.[0] || []).map((h) => clean(h));
}

export async function findColumnIndex(sheetName, columnName) {
  const headers = await getHeaders(sheetName);
  return headers.findIndex((h) => clean(h).toUpperCase() === clean(columnName).toUpperCase());
}