import "dotenv/config";
import { config } from "../config/index.js";
import { STATUS } from "../config/sheetSchema.js";
import {
  readSheet,
  findHeader,
  findHeaderIndex,
  toNumber,
  clean,
} from "../services/sheets.js";
import { normalizePhone } from "../utils/phone.js";
import { rupiah } from "../utils/rupiah.js";

const {
  sheets: { anggota: SHEET_ANGGOTA, pinjaman: SHEET_PINJAMAN, angsuran: SHEET_ANGSURAN },
} = config;

function normalizeText(text) {
  return String(text || "").toLowerCase().trim().replace(/\s+/g, " ");
}

export function isLoanQuestion(text) {
  const value = normalizeText(text);
  if (!value) return false;

  const keywords = [
    "dapat berapa", "dapat berapa ya", "pinjaman saya", "pinjaman berapa",
    "sisa pinjaman", "sisa angsuran", "angsuran saya", "tagihan saya",
    "cicilan saya", "berapa pinjaman", "berapa angsuran", "berapa cicilan",
    "berapa tagihan", "cek pinjaman", "cek angsuran", "cek cicilan",
    "cek tagihan", "status pinjaman", "status angsuran", "pinjaman",
    "angsuran", "cicilan", "tagihan", "sudah ke berapa", "ke brp",
  ];

  return keywords.some((keyword) => value.includes(keyword));
}

export async function checkLoan(phone) {
  try {
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone) {
      return {
        found: false,
        message: "Nomor WhatsApp tidak dapat dikenali.",
      };
    }

    console.log("[CHECK LOAN] Nomor:", normalizedPhone);

    const [anggotaSheet, pinjamanSheet, angsuranSheet] = await Promise.all([
      readSheet(SHEET_ANGGOTA),
      readSheet(SHEET_PINJAMAN),
      readSheet(SHEET_ANGSURAN),
    ]);

    const phoneHeaderIndex = findHeaderIndex(anggotaSheet.headers, [
      "NO WA", "NO. WA", "NOMOR WA", "NO WHATSAPP", "NOMOR WHATSAPP",
      "PHONE", "TELEPON", "NO",
    ]);

    const userIdHeaderIndex = findHeaderIndex(anggotaSheet.headers, [
      "USER ID", "USERID", "ID ANGGOTA",
    ]);

    const nameHeaderIndex = findHeaderIndex(anggotaSheet.headers, ["NAMA", "NAMA ANGGOTA"]);

    let member;

    if (phoneHeaderIndex !== -1) {
      const phoneHeader = anggotaSheet.headers[phoneHeaderIndex];
      member = anggotaSheet.data.find(
        (row) => normalizePhone(row[phoneHeader]) === normalizedPhone,
      );
    } else {
      member = anggotaSheet.data.find((row) => {
        for (const k of Object.keys(row)) {
          if (k === "__rowNumber") continue;
          if (normalizePhone(row[k]) === normalizedPhone) return true;
        }
        return false;
      });
    }

    if (!member) {
      console.log("[CHECK LOAN] Anggota tidak ditemukan:", normalizedPhone);
      return {
        found: false,
        message:
          "Maaf, Anda bukan anggota koperasi.\n\n" +
          "Nomor WhatsApp Anda belum terdaftar sebagai anggota koperasi.",
      };
    }

    const userIdHeader = userIdHeaderIndex !== -1 ? anggotaSheet.headers[userIdHeaderIndex] : "USER ID";
    const nameHeader = nameHeaderIndex !== -1 ? anggotaSheet.headers[nameHeaderIndex] : null;

    const userId = String(member[userIdHeader] || "").trim();
    const name = nameHeader ? String(member[nameHeader] || "").trim() : "";

    console.log("[CHECK LOAN] Anggota ditemukan:", userId, name);

    const status = String(member["STATUS"] || "").trim().toUpperCase();

    if (status && status !== "AKTIF") {
      return {
        found: true,
        userId,
        name,
        message:
          `Halo ${name || "Anggota"},\n\n` +
          `Status keanggotaan Anda: ${status}\n\n` +
          `Silakan hubungi pengurus koperasi untuk informasi lebih lanjut.`,
      };
    }

    const loanUserIdIndex = findHeaderIndex(pinjamanSheet.headers, ["USER ID", "USERID", "ID ANGGOTA"]);
    const loanIdIndex = findHeaderIndex(pinjamanSheet.headers, ["PINJAMAN ID", "ID PINJAMAN", "LOAN ID"]);
    const loanAmountIndex = findHeaderIndex(pinjamanSheet.headers, [
      "PINJAMAN", "JUMLAH PINJAMAN", "NOMINAL PINJAMAN", "JUMLAH", "POKOK", "AMOUNT",
    ]);
    const tenorIndex = findHeaderIndex(pinjamanSheet.headers, ["TENOR", "TENOR MINGGU", "LAMA PINJAMAN"]);
    const loanStatusIndex = findHeaderIndex(pinjamanSheet.headers, ["STATUS", "STATUS PINJAMAN"]);

    const loanUserIdHeader = loanUserIdIndex !== -1 ? pinjamanSheet.headers[loanUserIdIndex] : "USER ID";
    const loanIdHeader = loanIdIndex !== -1 ? pinjamanSheet.headers[loanIdIndex] : "PINJAMAN ID";
    const loanAmountHeader = loanAmountIndex !== -1 ? pinjamanSheet.headers[loanAmountIndex] : null;
    const tenorHeader = tenorIndex !== -1 ? pinjamanSheet.headers[tenorIndex] : null;
    const loanStatusHeader = loanStatusIndex !== -1 ? pinjamanSheet.headers[loanStatusIndex] : null;

    const memberLoans = pinjamanSheet.data.filter(
      (row) =>
        String(row[loanUserIdHeader] || "").trim().toUpperCase() === userId.toUpperCase(),
    );

    if (!memberLoans.length) {
      return {
        found: true,
        userId,
        name,
        message:
          `Halo ${name || "Anggota"},\n\n` +
          `Anda belum memiliki data pinjaman aktif.`,
      };
    }

    let loan = memberLoans.find((row) => {
      if (!loanStatusHeader) return true;
      const st = String(row[loanStatusHeader] || "").trim().toUpperCase();
      return st === "AKTIF" || st === STATUS.PINJAMAN_BERJALAN;
    });

    if (!loan) loan = memberLoans[memberLoans.length - 1];

    const loanId = String(loan[loanIdHeader] || "").trim();
    const loanAmount = loanAmountHeader ? toNumber(loan[loanAmountHeader]) : 0;
    const tenor = tenorHeader ? loan[tenorHeader] : "-";
    const loanStatus = loanStatusHeader
      ? String(loan[loanStatusHeader] || "").trim() || STATUS.PINJAMAN_BERJALAN
      : STATUS.PINJAMAN_BERJALAN;

    console.log("[CHECK LOAN] Pinjaman:", loanId);

    const angsuranUserIdIndex = findHeaderIndex(angsuranSheet.headers, ["USER ID", "USERID", "ID ANGGOTA"]);
    const angsuranLoanIdIndex = findHeaderIndex(angsuranSheet.headers, ["PINJAMAN ID", "ID PINJAMAN", "LOAN ID"]);
    const mingguIndex = findHeaderIndex(angsuranSheet.headers, ["MINGGU", "ANGSURAN", "KE", "CICILAN KE"]);
    const tagihanIndex = findHeaderIndex(angsuranSheet.headers, ["TAGIHAN", "NOMINAL", "JUMLAH", "CICILAN"]);
    const statusAngsuranIndex = findHeaderIndex(angsuranSheet.headers, ["STATUS", "STATUS ANGSURAN"]);
    const jatuhTempoIndex = findHeaderIndex(angsuranSheet.headers, ["JATUH TEMPO", "JATUH TEMPO TANGGAL", "DUE DATE"]);
    const pembayaranTanggalIndex = findHeaderIndex(angsuranSheet.headers, ["TANGGAL PEMBAYARAN", "TANGGAL BAYAR", "PEMBAYARAN"]);

    const angsuranUserIdHeader = angsuranUserIdIndex !== -1 ? angsuranSheet.headers[angsuranUserIdIndex] : "USER ID";
    const angsuranLoanIdHeader = angsuranLoanIdIndex !== -1 ? angsuranSheet.headers[angsuranLoanIdIndex] : "PINJAMAN ID";
    const mingguHeader = mingguIndex !== -1 ? angsuranSheet.headers[mingguIndex] : null;
    const tagihanHeader = tagihanIndex !== -1 ? angsuranSheet.headers[tagihanIndex] : null;
    const statusAngsuranHeader = statusAngsuranIndex !== -1 ? angsuranSheet.headers[statusAngsuranIndex] : null;
    const jatuhTempoHeader = jatuhTempoIndex !== -1 ? angsuranSheet.headers[jatuhTempoIndex] : null;
    const pembayaranTanggalHeader = pembayaranTanggalIndex !== -1 ? angsuranSheet.headers[pembayaranTanggalIndex] : null;

    const installments = angsuranSheet.data.filter(
      (row) =>
        String(row[angsuranUserIdHeader] || "").trim().toUpperCase() === userId.toUpperCase() &&
        String(row[angsuranLoanIdHeader] || "").trim().toUpperCase() === loanId.toUpperCase(),
    );

    let paidCount = 0;
    let unpaidCount = 0;
    let totalPaid = 0;
    let totalRemaining = 0;

    const paidRows = [];
    const unpaidRows = [];

    for (const row of installments) {
      const amount = tagihanHeader ? toNumber(row[tagihanHeader]) : 0;
      const installmentStatus = statusAngsuranHeader
        ? String(row[statusAngsuranHeader] || "").trim().toUpperCase()
        : "";

      const isPaid =
        installmentStatus === STATUS.ANGSURAN_LUNAS ||
        installmentStatus === "SUDAH BAYAR" ||
        installmentStatus === "LUNAS" ||
        installmentStatus === "PAID";

      if (isPaid) {
        paidCount++;
        totalPaid += amount;
        paidRows.push(row);
      } else {
        unpaidCount++;
        totalRemaining += amount;
        unpaidRows.push(row);
      }
    }

    let nextInstallment = unpaidRows[0] || null;

    if (unpaidRows.length && mingguHeader) {
      nextInstallment = [...unpaidRows].sort(
        (a, b) => toNumber(a[mingguHeader]) - toNumber(b[mingguHeader]),
      )[0];
    }

    let nextNumber = "-";
    let nextAmount = 0;
    let nextDueDate = "-";
    let nextPaymentDate = "-";

    if (nextInstallment) {
      if (mingguHeader) nextNumber = nextInstallment[mingguHeader] || "-";
      if (tagihanHeader) nextAmount = toNumber(nextInstallment[tagihanHeader]);
      if (jatuhTempoHeader) nextDueDate = nextInstallment[jatuhTempoHeader] || "-";
      if (pembayaranTanggalHeader) nextPaymentDate = nextInstallment[pembayaranTanggalHeader] || "-";
    }

    const totalInstallments = installments.length;
    const loanPaidPercentage = totalInstallments > 0 ? Math.round((paidCount / totalInstallments) * 100) : 0;

    let message =
      `Halo ${name || "Anggota"}\n\n` +
      `DATA PINJAMAN ANDA\n\n` +
      `User ID: ${userId}\n` +
      `Pinjaman ID: ${loanId}\n` +
      `Jumlah Pinjaman: ${rupiah(loanAmount)}\n` +
      `Tenor: ${tenor} minggu\n` +
      `Status: ${loanStatus}\n\n` +
      `RIWAYAT ANGSURAN\n\n` +
      `Sudah bayar: ${paidCount} kali\n` +
      `Belum bayar: ${unpaidCount} kali\n` +
      `Total angsuran: ${totalInstallments}\n` +
      `Progress: ${loanPaidPercentage}%\n\n` +
      `Total sudah dibayar: ${rupiah(totalPaid)}\n` +
      `Sisa tagihan: ${rupiah(totalRemaining)}\n\n`;

    if (nextInstallment) {
      message +=
        `ANGSURAN BERIKUTNYA\n\n` +
        `Angsuran: Minggu ke-${nextNumber}\n` +
        `Tagihan: ${rupiah(nextAmount)}\n` +
        `Jatuh tempo: ${nextDueDate}\n`;

      if (nextPaymentDate && nextPaymentDate !== "-") {
        message += `Tanggal pembayaran: ${nextPaymentDate}\n`;
      }
    } else {
      message += `SEMUA ANGSURAN SUDAH LUNAS\n\nTidak ada tagihan angsuran berikutnya.`;
    }

    return {
      found: true,
      userId,
      name,
      loanId,
      loanAmount,
      tenor,
      loanStatus,
      paidCount,
      unpaidCount,
      totalInstallments,
      totalPaid,
      totalRemaining,
      nextInstallment: nextNumber,
      nextAmount,
      nextDueDate,
      message,
    };
  } catch (error) {
    console.error("CHECK LOAN ERROR:", error?.message || error);
    return {
      found: false,
      message: "Maaf, data pinjaman tidak dapat diambil saat ini. Silakan coba sesaat lagi.",
      error: error?.message || String(error),
    };
  }
}

export default { isLoanQuestion, checkLoan };