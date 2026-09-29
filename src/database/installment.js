import {
  readSheet,
  getHeaders,
  updateCell,
  findHeaderIndex,
  columnLetter,
  clean,
} from "../services/sheets.js";
import { config } from "../config/index.js";

const {
  sheets: { angsuran: SHEET_ANGSURAN, pinjaman: SHEET_PINJAMAN },
} = config;

export {
  getNextInstallment,
  getAllInstallments,
} from "./queries.js";

export async function getInstallmentByWeek(userId, loanId, week) {
  const { data } = await readSheet(SHEET_ANGSURAN);

  const targetUser = clean(userId).toUpperCase();
  const targetLoan = clean(loanId).toUpperCase();
  const targetWeek = String(week).trim();

  return data.find(
    (row) =>
      clean(row["USER ID"]).toUpperCase() === targetUser &&
      clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan &&
      String(row["MINGGU"] || "").trim() === targetWeek,
  );
}

export async function markInstallmentPaid(installment, paymentDate) {
  const rowNumber = installment.__rowNumber;

  if (!rowNumber) {
    throw new Error("Nomor baris angsuran tidak ditemukan.");
  }

  console.log("");
  console.log("=================================");
  console.log("UPDATE GOOGLE SHEETS");
  console.log("=================================");
  console.log("Sheet :", SHEET_ANGSURAN);
  console.log("Baris :", rowNumber);
  console.log("Minggu:", installment["MINGGU"]);

  const headers = await getHeaders(SHEET_ANGSURAN);

  const statusColumnIndex = findHeaderIndex(headers, ["STATUS"]);
  if (statusColumnIndex === -1) {
    throw new Error(`Kolom STATUS tidak ditemukan di sheet ${SHEET_ANGSURAN}.`);
  }

  await updateCell(
    SHEET_ANGSURAN,
    rowNumber,
    columnLetter(statusColumnIndex + 1),
    "SUDAH DIBAYAR",
  );

  const paymentDateColumnIndex = findHeaderIndex(headers, ["TANGGAL PEMBAYARAN"]);
  if (paymentDateColumnIndex !== -1) {
    await updateCell(
      SHEET_ANGSURAN,
      rowNumber,
      columnLetter(paymentDateColumnIndex + 1),
      paymentDate,
    );
  }

  console.log("STATUS BERHASIL DIUBAH MENJADI SUDAH DIBAYAR");

  return true;
}

export async function checkAndUpdateLoanStatus(userId, loanId) {
  const { data: angsuranRows } = await readSheet(SHEET_ANGSURAN);

  const targetUser = clean(userId).toUpperCase();
  const targetLoan = clean(loanId).toUpperCase();

  const installments = angsuranRows.filter(
    (row) =>
      clean(row["USER ID"]).toUpperCase() === targetUser &&
      clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan,
  );

  if (!installments.length) return false;

  const allPaid = installments.every((row) => {
    const status = clean(row["STATUS"]).toUpperCase();
    return status === "SUDAH DIBAYAR" || status === "LUNAS";
  });

  if (!allPaid) return false;

  const { data: pinjamanRows } = await readSheet(SHEET_PINJAMAN);

  const loanRow = pinjamanRows.find(
    (row) =>
      clean(row["USER ID"]).toUpperCase() === targetUser &&
      clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan,
  );

  if (!loanRow) return false;

  const currentStatus = clean(loanRow["STATUS"]).toUpperCase();
  if (currentStatus === "LUNAS") return false;

  const headers = await getHeaders(SHEET_PINJAMAN);
  const statusColumnIndex = findHeaderIndex(headers, ["STATUS"]);

  if (statusColumnIndex === -1) {
    console.error("[LOAN STATUS] Kolom STATUS tidak ditemukan");
    return false;
  }

  await updateCell(
    SHEET_PINJAMAN,
    loanRow.__rowNumber,
    columnLetter(statusColumnIndex + 1),
    "LUNAS",
  );

  console.log("[LOAN STATUS] Pinjaman", loanId, "diupdate menjadi LUNAS");
  return true;
}
