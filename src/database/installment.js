import { getRows } from "./reader.js";
import { clean, columnLetter } from "./helpers.js";
import { sheets, spreadsheetId } from "./client.js";

const SHEET_ANGSURAN = process.env.SHEET_ANGSURAN || "ANGSURAN";
const SHEET_PINJAMAN = process.env.SHEET_PINJAMAN || "PINJAMAN";

export async function getNextInstallment(userId, loanId) {
  const rows = await getRows(SHEET_ANGSURAN);

  const targetUser = clean(userId).toUpperCase();
  const targetLoan = clean(loanId).toUpperCase();

  return rows
    .filter(
      (row) =>
        clean(row["USER ID"]).toUpperCase() === targetUser &&
        clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan &&
        clean(row["STATUS"]).toUpperCase() !== "SUDAH DIBAYAR" &&
        clean(row["STATUS"]).toUpperCase() !== "LUNAS"
    )
    .sort((a, b) => Number(a["MINGGU"] || 0) - Number(b["MINGGU"] || 0))[0];
}

export async function getAllInstallments(userId, loanId) {
  const rows = await getRows(SHEET_ANGSURAN);

  const targetUser = clean(userId).toUpperCase();
  const targetLoan = clean(loanId).toUpperCase();

  return rows
    .filter(
      (row) =>
        clean(row["USER ID"]).toUpperCase() === targetUser &&
        clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan
    )
    .sort((a, b) => Number(a["MINGGU"] || 0) - Number(b["MINGGU"] || 0));
}

export async function getInstallmentByWeek(userId, loanId, week) {
  const rows = await getRows(SHEET_ANGSURAN);

  const targetUser = clean(userId).toUpperCase();
  const targetLoan = clean(loanId).toUpperCase();
  const targetWeek = String(week).trim();

  return rows.find(
    (row) =>
      clean(row["USER ID"]).toUpperCase() === targetUser &&
      clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan &&
      String(row["MINGGU"] || "").trim() === targetWeek
  );
}

export async function markInstallmentPaid(installment, paymentDate) {
  const sheetName = SHEET_ANGSURAN;

  const rowNumber = installment.__rowNumber;

  if (!rowNumber) {
    throw new Error("Nomor baris angsuran tidak ditemukan.");
  }

  console.log("");
  console.log("=================================");
  console.log("UPDATE GOOGLE SHEETS");
  console.log("=================================");
  console.log("Sheet :", sheetName);
  console.log("Baris :", rowNumber);
  console.log("Minggu:", installment["MINGGU"]);
  console.log("Status: SUDAH DIBAYAR");

  const headers = await getHeaders(sheetName);

  const statusColumnIndex = headers.findIndex(
    (header) => clean(header).toUpperCase() === "STATUS",
  );

  if (statusColumnIndex === -1) {
    throw new Error(`Kolom STATUS tidak ditemukan di sheet ${sheetName}.`);
  }

  const statusColumn = columnLetter(statusColumnIndex + 1);

  await sheets.spreadsheets.values.update({
    spreadsheetId,

    range: `'${sheetName}'!${statusColumn}${rowNumber}`,

    valueInputOption: "USER_ENTERED",

    requestBody: {
      values: [["SUDAH DIBAYAR"]],
    },
  });

  const paymentDateColumnIndex = headers.findIndex(
    (header) => clean(header).toUpperCase() === "TANGGAL PEMBAYARAN",
  );

  if (paymentDateColumnIndex !== -1) {
    const paymentDateColumn = columnLetter(paymentDateColumnIndex + 1);

    await sheets.spreadsheets.values.update({
      spreadsheetId,

      range: `'${sheetName}'!${paymentDateColumn}${rowNumber}`,

      valueInputOption: "USER_ENTERED",

      requestBody: {
        values: [[paymentDate]],
      },
    });
  }

  console.log("✅ STATUS BERHASIL DIUBAH MENJADI SUDAH DIBAYAR");

  return true;
}

async function getHeaders(sheetName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!1:1`,
  });

  return (response.data.values?.[0] || []).map((h) => clean(h));
}

export async function checkAndUpdateLoanStatus(userId, loanId) {
  const angsuranRows = await getRows(SHEET_ANGSURAN);

  const targetUser = clean(userId).toUpperCase();
  const targetLoan = clean(loanId).toUpperCase();

  const installments = angsuranRows.filter(
    (row) =>
      clean(row["USER ID"]).toUpperCase() === targetUser &&
      clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan
  );

  if (!installments.length) {
    return false;
  }

  const allPaid = installments.every((row) => {
    const status = clean(row["STATUS"]).toUpperCase();
    return status === "SUDAH DIBAYAR" || status === "LUNAS";
  });

  if (!allPaid) {
    return false;
  }

  const pinjamanRows = await getRows(SHEET_PINJAMAN);

  const loanRow = pinjamanRows.find(
    (row) =>
      clean(row["USER ID"]).toUpperCase() === targetUser &&
      clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan
  );

  if (!loanRow) {
    return false;
  }

  const currentStatus = clean(loanRow["STATUS"]).toUpperCase();
  if (currentStatus === "LUNAS") {
    return false;
  }

  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SHEET_PINJAMAN}'!1:1`,
  });

  const headers = headerResponse.data.values?.[0] || [];
  const statusColumnIndex = headers.findIndex(
    (header) => clean(header).toUpperCase() === "STATUS",
  );

  if (statusColumnIndex === -1) {
    console.error("[LOAN STATUS] Kolom STATUS tidak ditemukan");
    return false;
  }

  const statusColumn = columnLetter(statusColumnIndex + 1);
  const rowNumber = loanRow.__rowNumber;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SHEET_PINJAMAN}'!${statusColumn}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [["LUNAS"]],
    },
  });

  console.log("[LOAN STATUS] Pinjaman", loanId, "diupdate menjadi LUNAS");
  return true;
}