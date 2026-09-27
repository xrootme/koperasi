import { markInstallmentPaid, checkAndUpdateLoanStatus } from "../database/index.js";
import { parsePaymentDate, formatDate, getTodayJakarta, addDays } from "./dateUtils.js";
import { parseAmount, clean } from "./amountUtils.js";

export async function processPayment(payment, loan, installment) {
  try {
    console.log("");
    console.log("=================================");
    console.log("        PROSES PEMBAYARAN");
    console.log("=================================");

    if (!payment) {
      return {
        success: false,
        status: "INVALID_PAYMENT",
        message: "Data pembayaran tidak ditemukan.",
      };
    }

    if (!loan) {
      return {
        success: false,
        status: "INVALID_LOAN",
        message: "Data pinjaman tidak ditemukan.",
      };
    }

    if (!installment) {
      return {
        success: false,
        status: "NO_INSTALLMENT",
        message: "Tidak ditemukan angsuran yang belum lunas.",
      };
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
      console.log("❌ FORMAT TANGGAL TIDAK VALID");

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
      console.log("❌ TANGGAL TERLALU LAMA");

      return {
        success: false,
        status: "TRANSFER_DATE_TOO_OLD",
        message: `Tanggal transfer ${formatDate(
          paymentDate,
        )} terlalu lama. Pembayaran diterima mulai ${formatDate(minDate)}.`,
      };
    }

    if (paymentDate > maxDate) {
      console.log("❌ TANGGAL TERLALU JAUH");

      return {
        success: false,
        status: "TRANSFER_DATE_TOO_FAR",
        message: `Tanggal transfer ${formatDate(
          paymentDate,
        )} terlalu jauh. Pembayaran diterima sampai ${formatDate(maxDate)}.`,
      };
    }

    console.log("✅ TANGGAL VALID");

    const status = clean(installment["STATUS"]);

    if (status === "SUDAH DIBAYAR") {
      console.log("❌ ANGSURAN SUDAH DIBAYAR");

      return {
        success: false,
        status: "ALREADY_PAID",
        message: `Angsuran ke-${installment["MINGGU"]} sudah DIBAYAR.`,
      };
    }

    const installmentUser = clean(installment["USER ID"]);

    if (userId && installmentUser && userId !== installmentUser) {
      console.log("❌ USER ID TIDAK SESUAI");

      return {
        success: false,
        status: "USER_MISMATCH",
        message: "User ID pembayaran tidak sesuai dengan angsuran.",
      };
    }

    const loanId = clean(loan["PINJAMAN ID"]);

    const installmentLoanId = clean(installment["PINJAMAN ID"]);

    if (loanId && installmentLoanId && loanId !== installmentLoanId) {
      console.log("❌ PINJAMAN TIDAK SESUAI");

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
      console.log("❌ NOMINAL TIDAK SESUAI");

      return {
        success: false,
        status: "INVALID_AMOUNT",
        message: `Nominal transfer Rp${transferAmount.toLocaleString(
          "id-ID",
        )} tidak sesuai dengan tagihan angsuran ke-${installment["MINGGU"]} sebesar Rp${tagihan.toLocaleString(
          "id-ID",
        )}.`,
      };
    }

    console.log("✅ NOMINAL SESUAI");

    const currentInstallment = Number(installment["MINGGU"]);

    if (!Number.isFinite(currentInstallment) || currentInstallment <= 0) {
      return {
        success: false,
        status: "INVALID_INSTALLMENT",
        message: "Nomor angsuran tidak valid.",
      };
    }

    console.log("");
    console.log("🔄 UPDATE GOOGLE SHEETS...");

    await markInstallmentPaid(installment, formatDate(paymentDate));

    console.log("✅ GOOGLE SHEETS BERHASIL DIUPDATE");

    const loanFullyPaid = await checkAndUpdateLoanStatus(
      payment.user_id,
      loan["PINJAMAN ID"],
    );

    if (loanFullyPaid) {
      console.log("🎉 PINJAMAN LUNAS SEMUA ANGSURAN");
    }

    const nextInstallment = currentInstallment + 1;

    let nextDueDate = "";

    const currentDueDate = parsePaymentDate(
      String(installment["JATUH TEMPO"] ?? "").trim(),
    );

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

    console.log("     PEMBAYARAN BERHASIL");

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
    console.error("❌ PAYMENT PROCESSOR ERROR");

    console.error(error);

    return {
      success: false,
      status: "SYSTEM_ERROR",
      message:
        "Terjadi kesalahan sistem saat memproses pembayaran. Data angsuran tidak diubah.",
      error: error?.message || String(error),
    };
  }
}