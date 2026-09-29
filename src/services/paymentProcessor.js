import { config } from "../config/index.js";
import {
  getSheetsClient,
  readSheet,
  findHeaderIndex,
  columnLetter,
  clean,
} from "../services/sheets.js";
import { parsePaymentDate, formatDate, getTodayJakarta, addDays } from "./dateUtils.js";
import { parseAmount, clean as cleanAmount } from "./amountUtils.js";

const {
  sheets: { angsuran: SHEET_ANGSURAN, pinjaman: SHEET_PINJAMAN },
} = config;

export async function processPayment(payment, loan, installment) {
  try {
    console.log("");
    console.log("=================================");
    console.log("PROSES PEMBAYARAN");
    console.log("=================================");

    if (!payment) {
      return { success: false, status: "INVALID_PAYMENT", message: "Data pembayaran tidak ditemukan." };
    }
    if (!loan) {
      return { success: false, status: "INVALID_LOAN", message: "Data pinjaman tidak ditemukan." };
    }
    if (!installment) {
      return { success: false, status: "NO_INSTALLMENT", message: "Tidak ditemukan angsuran yang belum lunas." };
    }

    const userId = clean(payment.user_id);
    const transferDateText = String(payment.transfer_date ?? "").trim();
    const transferAmount = parseAmount(payment.amount);

    console.log("USER ID      :", userId);
    console.log("PINJAMAN     :", loan["PINJAMAN ID"]);
    console.log("TRANSFER     :", transferAmount);
    console.log("TAGIHAN      :", installment["TAGIHAN"]);
    console.log("TANGGAL RAW  :", transferDateText);
    console.log("MINGGU       :", installment["MINGGU"]);

    const paymentDate = parsePaymentDate(transferDateText);

    if (!paymentDate) {
      console.log("FORMAT TANGGAL TIDAK VALID");
      return {
        success: false,
        status: "INVALID_DATE_FORMAT",
        message: `Tanggal transfer "${transferDateText}" tidak dapat dibaca.`,
      };
    }

    console.log("TANGGAL PARSED:", formatDate(paymentDate));

    const todayText = getTodayJakarta();
    const todayDate = parsePaymentDate(todayText);

    console.log("HARI INI     :", todayText);

    const minDate = addDays(todayDate, -1);
    const maxDate = addDays(todayDate, 2);

    console.log("BATAS MIN    :", formatDate(minDate));
    console.log("BATAS MAX    :", formatDate(maxDate));

    if (paymentDate < minDate) {
      console.log("TANGGAL TERLALU LAMA");
      return {
        success: false,
        status: "TRANSFER_DATE_TOO_OLD",
        message: `Tanggal transfer ${formatDate(paymentDate)} terlalu lama. Pembayaran diterima mulai ${formatDate(minDate)}.`,
      };
    }

    if (paymentDate > maxDate) {
      console.log("TANGGAL TERLALU JAUH");
      return {
        success: false,
        status: "TRANSFER_DATE_TOO_FAR",
        message: `Tanggal transfer ${formatDate(paymentDate)} terlalu jauh. Pembayaran diterima sampai ${formatDate(maxDate)}.`,
      };
    }

    console.log("TANGGAL VALID");

    const status = clean(installment["STATUS"]);

    if (status === "SUDAH DIBAYAR") {
      console.log("ANGSURAN SUDAH DIBAYAR");
      return {
        success: false,
        status: "ALREADY_PAID",
        message: `Angsuran ke-${installment["MINGGU"]} sudah DIBAYAR.`,
      };
    }

    const installmentUser = clean(installment["USER ID"]);
    if (userId && installmentUser && userId !== installmentUser) {
      console.log("USER ID TIDAK SESUAI");
      return {
        success: false,
        status: "USER_MISMATCH",
        message: "User ID pembayaran tidak sesuai dengan angsuran.",
      };
    }

    const loanId = clean(loan["PINJAMAN ID"]);
    const installmentLoanId = clean(installment["PINJAMAN ID"]);

    if (loanId && installmentLoanId && loanId !== installmentLoanId) {
      console.log("PINJAMAN TIDAK SESUAI");
      return {
        success: false,
        status: "LOAN_MISMATCH",
        message: "Pinjaman tidak sesuai dengan angsuran.",
      };
    }

    const tagihan = parseAmount(installment["TAGIHAN"]);

    console.log("TRANSFER      : Rp" + transferAmount.toLocaleString("id-ID"));
    console.log("TAGIHAN       : Rp" + tagihan.toLocaleString("id-ID"));

    if (transferAmount !== tagihan) {
      console.log("NOMINAL TIDAK SESUAI");
      return {
        success: false,
        status: "INVALID_AMOUNT",
        message: `Nominal transfer Rp${transferAmount.toLocaleString("id-ID")} tidak sesuai dengan tagihan angsuran ke-${installment["MINGGU"]} sebesar Rp${tagihan.toLocaleString("id-ID")}.`,
      };
    }

    console.log("NOMINAL SESUAI");

    const currentInstallment = Number(installment["MINGGU"]);

    if (!Number.isFinite(currentInstallment) || currentInstallment <= 0) {
      return { success: false, status: "INVALID_INSTALLMENT", message: "Nomor angsuran tidak valid." };
    }

    console.log("");
    console.log("UPDATE GOOGLE SHEETS...");

    await markInstallmentPaid(installment, formatDate(paymentDate));

    console.log("GOOGLE SHEETS BERHASIL DIUPDATE");

    const loanFullyPaid = await checkAndUpdateLoanStatus(payment.user_id, loan["PINJAMAN ID"]);

    if (loanFullyPaid) {
      console.log("PINJAMAN LUNAS SEMUA ANGSURAN");
    }

    const nextInstallment = currentInstallment + 1;

    let nextDueDate = "";
    const currentDueDate = parsePaymentDate(String(installment["JATUH TEMPO"] ?? "").trim());

    if (currentDueDate) {
      nextDueDate = formatDate(addDays(currentDueDate, 7));
    }

    const result = {
      success: true,
      status: "PAID",
      user_id: payment.user_id,
      loan_id: loan["PINJAMAN ID"],
      paid_installment: currentInstallment,
      paid_amount: tagihan,
      payment_date: formatDate(paymentDate),
      paid_status: "SUDAH DIBAYAR",
      loan_status: loanFullyPaid ? "LUNAS" : "BERJALAN",
      previous_due_date: installment["JATUH TEMPO"] || "",
      next_installment: loanFullyPaid ? null : nextInstallment,
      next_due_date: loanFullyPaid ? null : nextDueDate,
      message: loanFullyPaid
        ? `Pembayaran angsuran ke-${currentInstallment} berhasil. SELAMAT! Pinjaman ${loan["PINJAMAN ID"]} sudah LUNAS SEMUA.`
        : `Pembayaran angsuran ke-${currentInstallment} berhasil. Angsuran berikutnya: ke-${nextInstallment}.`,
    };

    console.log("");
    console.log("=================================");
    console.log("PEMBAYARAN BERHASIL");
    console.log("=================================");
    console.log("USER ID      :", result.user_id);
    console.log("PINJAMAN     :", result.loan_id);
    console.log("ANGSURAN     :", result.paid_installment);
    console.log("NOMINAL      :", result.paid_amount);
    console.log("TANGGAL      :", result.payment_date);
    console.log("STATUS       :", result.paid_status);
    console.log("BERIKUTNYA   :", result.next_installment);
    console.log("JATUH TEMPO  :", result.next_due_date || "-");
    console.log("=================================");

    return result;
  } catch (error) {
    console.error("");
    console.error("PAYMENT PROCESSOR ERROR");
    console.error(error);

    return {
      success: false,
      status: "SYSTEM_ERROR",
      message: "Terjadi kesalahan sistem saat memproses pembayaran. Data angsuran tidak diubah.",
      error: error?.message || String(error),
    };
  }
}

async function markInstallmentPaid(installment, paymentDate) {
  const sheetName = SHEET_ANGSURAN;
  const sid = config.google.sheetId;
  const sheets = getSheetsClient();

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

  const statusColumnIndex = findHeaderIndex(headers, ["STATUS"]);

  if (statusColumnIndex === -1) {
    throw new Error(`Kolom STATUS tidak ditemukan di sheet ${sheetName}.`);
  }

  const statusColumn = columnLetter(statusColumnIndex + 1);

  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range: `'${sheetName}'!${statusColumn}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [["SUDAH DIBAYAR"]] },
  });

  const paymentDateColumnIndex = findHeaderIndex(headers, ["TANGGAL PEMBAYARAN"]);

  if (paymentDateColumnIndex !== -1) {
    const paymentDateColumn = columnLetter(paymentDateColumnIndex + 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: sid,
      range: `'${sheetName}'!${paymentDateColumn}${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[paymentDate]] },
    });
  }

  console.log("STATUS BERHASIL DIUBAH MENJADI SUDAH DIBAYAR");

  return true;
}

async function getHeaders(sheetName) {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId,
    range: `'${sheetName}'!1:1`,
  });
  return (response.data.values?.[0] || []).map((h) => String(h || "").trim());
}

export async function checkAndUpdateLoanStatus(userId, loanId) {
  const angsuranRows = await readSheet(SHEET_ANGSURAN);

  const targetUser = clean(userId).toUpperCase();
  const targetLoan = clean(loanId).toUpperCase();

  const installments = angsuranRows.data.filter(
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

  const pinjamanRows = await readSheet(SHEET_PINJAMAN);

  const loanRow = pinjamanRows.data.find(
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

  const sid = config.google.sheetId;
  const sheets = getSheetsClient();
  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `'${SHEET_PINJAMAN}'!1:1`,
  });

  const headers = headerResponse.data.values?.[0] || [];
  const statusColumnIndex = findHeaderIndex(headers, ["STATUS"]);

  if (statusColumnIndex === -1) {
    console.error("[LOAN STATUS] Kolom STATUS tidak ditemukan");
    return false;
  }

  const statusColumn = columnLetter(statusColumnIndex + 1);
  const rowNumber = loanRow.__rowNumber;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range: `'${SHEET_PINJAMAN}'!${statusColumn}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [["LUNAS"]] },
  });

  console.log("[LOAN STATUS] Pinjaman", loanId, "diupdate menjadi LUNAS");
  return true;
}