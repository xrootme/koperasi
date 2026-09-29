import { readSheet, getHeaders, clean } from "../services/sheets.js";

export async function getRows(sheetName) {
  const { data } = await readSheet(sheetName);
  return data;
}

export async function findColumnIndex(sheetName, columnName) {
  const headers = await getHeaders(sheetName);
  return headers.findIndex(
    (h) => clean(h).toUpperCase() === clean(columnName).toUpperCase(),
  );
}
