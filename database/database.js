import { google } from "googleapis";
import dotenv from "dotenv";
import { normalizePhone } from "../utils/phone.js";

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

const sheets = google.sheets({
  version: "v4",
  auth,
});

function clean(value) {
  return String(value ?? "").trim();
}

/*
 * ==================================================
 * AMBIL DATA SHEET
 * ==================================================
 */

export async function getRows(sheetName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
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

    /*
     * Nomor baris asli Google Sheets.
     *
     * Baris 1 = header
     * Data pertama = baris 2
     */
    obj.__rowNumber = index + 2;

    return obj;
  });
}

/*
 * ==================================================
 * ANGGOTA
 * ==================================================
 */

export async function getMemberByPhone(phone) {
  const rows = await getRows(process.env.SHEET_ANGGOTA || "ANGGOTA");

  const target = normalizePhone(phone);

  console.log(`[SHEETS] mencari anggota: ${target}`);

  if (!target) {
    return undefined;
  }

  const member = rows.find((row) => {
    const sheetPhone = normalizePhone(row["NO WA"]);

    return sheetPhone === target;
  });

  if (member) {
    console.log(`[SHEETS] anggota ditemukan: ${member["USER ID"]}`);
  } else {
    console.log(`[SHEETS] anggota tidak ditemukan: ${target}`);
  }

  return member;
}

export async function getMembersByHari(hari) {
  const rows = await getRows(process.env.SHEET_ANGGOTA || "ANGGOTA");
  const target = String(hari || "").trim().toUpperCase();
  return rows.filter((r) => String(r["HARI TAGIHAN"] || r["HARI"] || "").trim().toUpperCase() === target);
}

export async function getMembersGroupedByHari() {
  const rows = await getRows(process.env.SHEET_ANGGOTA || "ANGGOTA");
  const g = {};
  for (const r of rows) {
    const hari = String(r["HARI TAGIHAN"] || r["HARI"] || "-").trim().toUpperCase() || "-";
    if (!g[hari]) g[hari] = [];
    g[hari].push(r);
  }
  return g;
}

/*
 * ==================================================
 * PINJAMAN AKTIF
 * ==================================================
 */

export async function getActiveLoan(userId) {
  const rows = await getRows(process.env.SHEET_PINJAMAN || "PINJAMAN");

  const target = clean(userId).toUpperCase();

  return rows.find(
    (row) =>
      clean(row["USER ID"]).toUpperCase() === target &&
      clean(row["STATUS"]).toUpperCase() === "BERJALAN",
  );
}

/*
 * ==================================================
 * ANGSURAN BERIKUTNYA
 * ==================================================
 */

export async function getNextInstallment(userId, loanId) {
  const rows = await getRows(process.env.SHEET_ANGSURAN || "ANGSURAN");

  const targetUser = clean(userId).toUpperCase();
  const targetLoan = clean(loanId).toUpperCase();

  return rows
    .filter(
      (row) =>
        clean(row["USER ID"]).toUpperCase() === targetUser &&
        clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan &&
        clean(row["STATUS"]).toUpperCase() !== "SUDAH DIBAYAR" &&
        clean(row["STATUS"]).toUpperCase() !== "LUNAS",
    )
    .sort((a, b) => Number(a["MINGGU"] || 0) - Number(b["MINGGU"] || 0))[0];
}

/*
 * ==================================================
 * CEK & UPDATE STATUS PINJAMAN
 * ==================================================
 *
 * Jika semua angsuran sudah SUDAH DIBAYAR,
 * update status pinjaman menjadi LUNAS.
 */

export async function checkAndUpdateLoanStatus(userId, loanId) {
  const angsuranRows = await getRows(process.env.SHEET_ANGSURAN || "ANGSURAN");

  const targetUser = clean(userId).toUpperCase();
  const targetLoan = clean(loanId).toUpperCase();

  const installments = angsuranRows.filter(
    (row) =>
      clean(row["USER ID"]).toUpperCase() === targetUser &&
      clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan,
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

  const pinjamanRows = await getRows(process.env.SHEET_PINJAMAN || "PINJAMAN");

  const loanRow = pinjamanRows.find(
    (row) =>
      clean(row["USER ID"]).toUpperCase() === targetUser &&
      clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan,
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
    range: `'${process.env.SHEET_PINJAMAN || "PINJAMAN"}'!1:1`,
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
    range: `'${process.env.SHEET_PINJAMAN || "PINJAMAN"}'!${statusColumn}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [["LUNAS"]],
    },
  });

  console.log("[LOAN STATUS] Pinjaman", loanId, "diupdate menjadi LUNAS");
  return true;
}

/*
 * ==================================================
 * UPDATE STATUS ANGSURAN
 * ==================================================
 *
 * STATUS:
 *
 * BELUM DIBAYAR
 *     ↓
 * SUDAH DIBAYAR
 *
 * Juga menyimpan tanggal pembayaran.
 */

export async function markInstallmentPaid(installment, paymentDate) {
  const sheetName = process.env.SHEET_ANGSURAN || "ANGSURAN";

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

  /*
   * Baca header terlebih dahulu supaya kita tahu
   * kolom STATUS dan TANGGAL PEMBAYARAN.
   */

  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!1:1`,
  });

  const headers = headerResponse.data.values?.[0] || [];

  const statusColumnIndex = headers.findIndex(
    (header) => clean(header).toUpperCase() === "STATUS",
  );

  if (statusColumnIndex === -1) {
    throw new Error(`Kolom STATUS tidak ditemukan di sheet ${sheetName}.`);
  }

  /*
   * Update STATUS menjadi SUDAH DIBAYAR.
   */

  const statusColumn = columnLetter(statusColumnIndex + 1);

  await sheets.spreadsheets.values.update({
    spreadsheetId,

    range: `'${sheetName}'!${statusColumn}${rowNumber}`,

    valueInputOption: "USER_ENTERED",

    requestBody: {
      values: [["SUDAH DIBAYAR"]],
    },
  });

  /*
   * Kalau ada kolom TANGGAL PEMBAYARAN,
   * otomatis isi tanggal pembayaran.
   */

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

/*
 * ==================================================
 * NOMOR KOLOM → HURUF
 * ==================================================
 *
 * 1  = A
 * 2  = B
 * 26 = Z
 * 27 = AA
 */

function columnLetter(columnNumber) {
  let result = "";

  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;

    result = String.fromCharCode(65 + remainder) + result;

    columnNumber = Math.floor((columnNumber - 1) / 26);
  }

  return result;
}
