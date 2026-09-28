import { getRows } from "./reader.js";
import { clean } from "./helpers.js";

const SHEET_PINJAMAN = process.env.SHEET_PINJAMAN || "PINJAMAN";

export async function getActiveLoan(userId) {
  const rows = await getRows(SHEET_PINJAMAN);

  const target = clean(userId).toUpperCase();

  return rows.find((row) => {
    const isUser = clean(row["USER ID"]).toUpperCase() === target;
    const status = clean(row["STATUS"]).toUpperCase();
    return isUser && (status === "BERJALAN" || status === "AKTIF");
  });
}

export async function getLoanById(userId, loanId) {
  const rows = await getRows(SHEET_PINJAMAN);

  const targetUser = clean(userId).toUpperCase();
  const targetLoan = clean(loanId).toUpperCase();

  return rows.find(
    (row) =>
      clean(row["USER ID"]).toUpperCase() === targetUser &&
      clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan
  );
}

export async function getAllLoansByUserId(userId) {
  const rows = await getRows(SHEET_PINJAMAN);

  const target = clean(userId).toUpperCase();

  return rows.filter(
    (row) => clean(row["USER ID"]).toUpperCase() === target
  );
}