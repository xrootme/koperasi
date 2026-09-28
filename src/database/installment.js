import { getRows } from "./reader.js";
import { clean } from "./helpers.js";

const SHEET_ANGSURAN = process.env.SHEET_ANGSURAN || "ANGSURAN";

export async function getNextInstallment(userId, loanId) {
  const rows = await getRows(SHEET_ANGSURAN);

  const targetUser = clean(userId).toUpperCase();
  const targetLoan = clean(loanId).toUpperCase();

  const installments = rows.filter(
    (row) =>
      clean(row["USER ID"]).toUpperCase() === targetUser &&
      clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan
  );

  if (!installments.length) {
    return undefined;
  }

  const unpaid = installments.find(
    (row) =>
      clean(row["STATUS"]).toUpperCase() !== "SUDAH DIBAYAR" &&
      clean(row["STATUS"]).toUpperCase() !== "PAID"
  );

  return unpaid || undefined;
}

export async function getInstallmentsByLoan(loanId) {
  const rows = await getRows(SHEET_ANGSURAN);

  const targetLoan = clean(loanId).toUpperCase();

  return rows.filter(
    (row) => clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan
  );
}

export async function getInstallmentsByUserId(userId) {
  const rows = await getRows(SHEET_ANGSURAN);

  const targetUser = clean(userId).toUpperCase();

  return rows.filter(
    (row) => clean(row["USER ID"]).toUpperCase() === targetUser
  );
}