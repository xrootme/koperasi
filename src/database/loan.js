import { readSheet, clean } from "../services/sheets.js";
import { config } from "../config/index.js";

const {
  sheets: { pinjaman: SHEET_PINJAMAN },
} = config;

export { getActiveLoan } from "./queries.js";

export async function getLoanById(userId, loanId) {
  const { data } = await readSheet(SHEET_PINJAMAN);
  const targetUser = clean(userId).toUpperCase();
  const targetLoan = clean(loanId).toUpperCase();

  return data.find(
    (row) =>
      clean(row["USER ID"]).toUpperCase() === targetUser &&
      clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan,
  );
}

export async function getAllLoansByUserId(userId) {
  const { data } = await readSheet(SHEET_PINJAMAN);
  const target = clean(userId).toUpperCase();
  return data.filter((row) => clean(row["USER ID"]).toUpperCase() === target);
}
