import "dotenv/config";
import fs from "fs";
import path from "path";
import { google } from "googleapis";

// ==========================================
// CONFIG
// ==========================================

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const CREDENTIALS = process.env.GOOGLE_SHEET_CREDENTIALS;

const SHEET_ANGGOTA = process.env.SHEET_ANGGOTA || "ANGGOTA";

const SHEET_PINJAMAN = process.env.SHEET_PINJAMAN || "PINJAMAN";

const SHEET_ANGSURAN = process.env.SHEET_ANGSURAN || "ANGSURAN";

// ==========================================
// GOOGLE AUTH
// ==========================================

function getCredentialsPath() {
  const credentialPath = path.resolve(process.cwd(), CREDENTIALS);

  if (!fs.existsSync(credentialPath)) {
    throw new Error("File Google Service Account tidak ditemukan.");
  }

  return credentialPath;
}

async function getSheets() {
  const credentialsPath = getCredentialsPath();

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({
    version: "v4",
    auth,
  });
}

// ==========================================
// NORMALIZE PHONE
// ==========================================

function normalizePhone(phone) {
  if (!phone) return "";

  let value = String(phone).trim().replace(/\D/g, "");

  if (value.startsWith("0")) {
    value = "62" + value.substring(1);
  }

  if (value.startsWith("8")) {
    value = "62" + value;
  }

  return value;
}

// ==========================================
// NORMALIZE TEXT
// ==========================================

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// ==========================================
// DETEKSI PERTANYAAN PINJAMAN
// ==========================================

export function isLoanQuestion(text) {
  const value = normalizeText(text);

  if (!value) {
    return false;
  }

  const keywords = [
    "dapat berapa",
    "dapat berapa ya",
    "pinjaman saya",
    "pinjaman berapa",
    "sisa pinjaman",
    "sisa angsuran",
    "angsuran saya",
    "tagihan saya",
    "cicilan saya",
    "berapa pinjaman",
    "berapa angsuran",
    "berapa cicilan",
    "berapa tagihan",
    "cek pinjaman",
    "cek angsuran",
    "cek cicilan",
    "cek tagihan",
    "status pinjaman",
    "status angsuran",
    "pinjaman",
    "angsuran",
    "cicilan",
    "tagihan",
    "sudah ke berapa",
    "ke brp",
  ];

  return keywords.some((keyword) => value.includes(keyword));
}

// ==========================================
// HEADER FINDER
// ==========================================

function findHeader(headers, aliases) {
  for (const alias of aliases) {
    const index = headers.findIndex(
      (header) => normalizeText(header) === normalizeText(alias),
    );

    if (index !== -1) {
      return index;
    }
  }

  return -1;
}

// ==========================================
// READ SHEET
// ==========================================

async function readSheet(sheets, sheetName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:Z`,
  });

  const rows = response.data.values || [];

  if (!rows.length) {
    return {
      headers: [],
      data: [],
    };
  }

  const headers = rows[0];

  const data = rows.slice(1).map((row) => {
    const object = {};

    headers.forEach((header, index) => {
      object[header] = row[index] || "";
    });

    return object;
  });

  return {
    headers,
    data,
  };
}

// ==========================================
// NUMBER
// ==========================================

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  const number = Number(String(value).replace(/[^\d-]/g, ""));

  return Number.isFinite(number) ? number : 0;
}

// ==========================================
// RUPIAH
// ==========================================

function rupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(toNumber(value));
}

// ==========================================
// CHECK LOAN
// ==========================================

export async function checkLoan(phone) {
  try {
    if (!SHEET_ID) {
      throw new Error("GOOGLE_SHEET_ID belum diatur.");
    }

    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone) {
      return {
        found: false,
        message: "❌ Nomor WhatsApp tidak dapat dikenali.",
      };
    }

    console.log("[CHECK LOAN] Nomor:", normalizedPhone);

    const sheets = await getSheets();

    // ======================================
    // BACA ANGGOTA
    // ======================================

    const anggotaSheet = await readSheet(sheets, SHEET_ANGGOTA);

    const anggotaHeaders = anggotaSheet.headers;

    const anggotaData = anggotaSheet.data;

    const phoneHeaderIndex = findHeader(anggotaHeaders, [
      "NO WA",
      "NO. WA",
      "NOMOR WA",
      "NO WHATSAPP",
      "NOMOR WHATSAPP",
      "PHONE",
    ]);

    const userIdHeaderIndex = findHeader(anggotaHeaders, [
      "USER ID",
      "USERID",
      "ID ANGGOTA",
    ]);

    const nameHeaderIndex = findHeader(anggotaHeaders, [
      "NAMA",
      "NAMA ANGGOTA",
    ]);

    if (phoneHeaderIndex === -1 || userIdHeaderIndex === -1) {
      throw new Error(
        "Kolom NO WA atau USER ID pada sheet ANGGOTA tidak ditemukan.",
      );
    }

    const phoneHeader = anggotaHeaders[phoneHeaderIndex];

    const userIdHeader = anggotaHeaders[userIdHeaderIndex];

    const nameHeader =
      nameHeaderIndex !== -1 ? anggotaHeaders[nameHeaderIndex] : null;

    // ======================================
    // CARI ANGGOTA BERDASARKAN NO WA
    // ======================================

    const member = anggotaData.find(
      (row) => normalizePhone(row[phoneHeader]) === normalizedPhone,
    );

    if (!member) {
      console.log("[CHECK LOAN] Anggota tidak ditemukan:", normalizedPhone);

      return {
        found: false,
        message:
          "❌ Maaf, Anda bukan anggota.\n\n" +
          "Nomor WhatsApp Anda belum terdaftar sebagai anggota.",
      };
    }

    const userId = String(member[userIdHeader] || "").trim();

    const name = nameHeader ? String(member[nameHeader] || "").trim() : "";

    console.log("[CHECK LOAN] Anggota ditemukan:", userId, name);

    // ======================================
    // CEK STATUS
    // ======================================

    const status = String(member["STATUS"] || "")
      .trim()
      .toUpperCase();

    if (status && status !== "AKTIF") {
      return {
        found: true,
        userId,
        name,
        message:
          `❌ Halo ${name || "Anggota"},\n\n` +
          `Status keanggotaan Anda: ${status}\n\n` +
          `Silakan hubungi pengurus koperasi.`,
      };
    }

    // ======================================
    // BACA PINJAMAN
    // ======================================

    const pinjamanSheet = await readSheet(sheets, SHEET_PINJAMAN);

    const pinjamanHeaders = pinjamanSheet.headers;

    const pinjamanData = pinjamanSheet.data;

    const loanUserIdIndex = findHeader(pinjamanHeaders, [
      "USER ID",
      "USERID",
      "ID ANGGOTA",
    ]);

    const loanIdIndex = findHeader(pinjamanHeaders, [
      "PINJAMAN ID",
      "ID PINJAMAN",
      "LOAN ID",
    ]);

    const loanAmountIndex = findHeader(pinjamanHeaders, [
      "PINJAMAN",
      "JUMLAH PINJAMAN",
      "NOMINAL PINJAMAN",
      "JUMLAH",
      "AMOUNT",
    ]);

    const tenorIndex = findHeader(pinjamanHeaders, [
      "TENOR",
      "TENOR MINGGU",
      "LAMA PINJAMAN",
    ]);

    const loanStatusIndex = findHeader(pinjamanHeaders, [
      "STATUS",
      "STATUS PINJAMAN",
    ]);

    if (loanUserIdIndex === -1 || loanIdIndex === -1) {
      throw new Error(
        "Kolom USER ID atau PINJAMAN ID pada sheet PINJAMAN tidak ditemukan.",
      );
    }

    const loanUserIdHeader = pinjamanHeaders[loanUserIdIndex];

    const loanIdHeader = pinjamanHeaders[loanIdIndex];

    const loanAmountHeader =
      loanAmountIndex !== -1 ? pinjamanHeaders[loanAmountIndex] : null;

    const tenorHeader = tenorIndex !== -1 ? pinjamanHeaders[tenorIndex] : null;

    const loanStatusHeader =
      loanStatusIndex !== -1 ? pinjamanHeaders[loanStatusIndex] : null;

    // ======================================
    // CARI PINJAMAN MILIK ANGGOTA
    // ======================================

    const memberLoans = pinjamanData.filter(
      (row) =>
        String(row[loanUserIdHeader] || "")
          .trim()
          .toUpperCase() === userId.toUpperCase(),
    );

    if (!memberLoans.length) {
      return {
        found: true,
        userId,
        name,
        message:
          `👋 Halo ${name || "Anggota"},\n\n` +
          `❌ Anda belum memiliki data pinjaman.`,
      };
    }

    // ======================================
    // PILIH PINJAMAN AKTIF
    // ======================================

    let loan = memberLoans.find(
      (row) =>
        loanStatusHeader &&
        String(row[loanStatusHeader] || "")
          .trim()
          .toUpperCase() === "AKTIF",
    );

    if (!loan) {
      loan = memberLoans[memberLoans.length - 1];
    }

    const loanId = String(loan[loanIdHeader] || "").trim();

    const loanAmount = loanAmountHeader ? toNumber(loan[loanAmountHeader]) : 0;

    const tenor = tenorHeader ? loan[tenorHeader] : "-";

    const loanStatus = loanStatusHeader
      ? String(loan[loanStatusHeader] || "").trim()
      : "AKTIF";

    console.log("[CHECK LOAN] Pinjaman:", loanId);

    // ======================================
    // BACA ANGSURAN
    // ======================================

    const angsuranSheet = await readSheet(sheets, SHEET_ANGSURAN);

    const angsuranHeaders = angsuranSheet.headers;

    const angsuranData = angsuranSheet.data;

    const angsuranUserIdIndex = findHeader(angsuranHeaders, [
      "USER ID",
      "USERID",
      "ID ANGGOTA",
    ]);

    const angsuranLoanIdIndex = findHeader(angsuranHeaders, [
      "PINJAMAN ID",
      "ID PINJAMAN",
      "LOAN ID",
    ]);

    const mingguIndex = findHeader(angsuranHeaders, [
      "MINGGU",
      "ANGSURAN",
      "KE",
      "CICILAN KE",
    ]);

    const tagihanIndex = findHeader(angsuranHeaders, [
      "TAGIHAN",
      "NOMINAL",
      "JUMLAH",
      "CICILAN",
      "ANGSURAN",
    ]);

    const statusAngsuranIndex = findHeader(angsuranHeaders, [
      "STATUS",
      "STATUS ANGSURAN",
    ]);

    const jatuhTempoIndex = findHeader(angsuranHeaders, [
      "JATUH TEMPO",
      "JATUH TEMPO TANGGAL",
      "DUE DATE",
    ]);

    const pembayaranTanggalIndex = findHeader(angsuranHeaders, [
      "TANGGAL PEMBAYARAN",
      "TANGGAL BAYAR",
      "PEMBAYARAN",
    ]);

    if (angsuranUserIdIndex === -1 || angsuranLoanIdIndex === -1) {
      throw new Error(
        "Kolom USER ID atau PINJAMAN ID pada sheet ANGSURAN tidak ditemukan.",
      );
    }

    const angsuranUserIdHeader = angsuranHeaders[angsuranUserIdIndex];

    const angsuranLoanIdHeader = angsuranHeaders[angsuranLoanIdIndex];

    const mingguHeader =
      mingguIndex !== -1 ? angsuranHeaders[mingguIndex] : null;

    const tagihanHeader =
      tagihanIndex !== -1 ? angsuranHeaders[tagihanIndex] : null;

    const statusAngsuranHeader =
      statusAngsuranIndex !== -1 ? angsuranHeaders[statusAngsuranIndex] : null;

    const jatuhTempoHeader =
      jatuhTempoIndex !== -1 ? angsuranHeaders[jatuhTempoIndex] : null;

    const pembayaranTanggalHeader =
      pembayaranTanggalIndex !== -1
        ? angsuranHeaders[pembayaranTanggalIndex]
        : null;

    // ======================================
    // FILTER ANGSURAN
    // ======================================

    const installments = angsuranData.filter(
      (row) =>
        String(row[angsuranUserIdHeader] || "")
          .trim()
          .toUpperCase() === userId.toUpperCase() &&
        String(row[angsuranLoanIdHeader] || "")
          .trim()
          .toUpperCase() === loanId.toUpperCase(),
    );

    // ======================================
    // HITUNG PEMBAYARAN
    // ======================================

    let paidCount = 0;
    let unpaidCount = 0;

    let totalPaid = 0;
    let totalRemaining = 0;

    const paidRows = [];
    const unpaidRows = [];

    for (const row of installments) {
      const amount = tagihanHeader ? toNumber(row[tagihanHeader]) : 0;

      const installmentStatus = statusAngsuranHeader
        ? String(row[statusAngsuranHeader] || "")
            .trim()
            .toUpperCase()
        : "";

      const isPaid =
        installmentStatus === "SUDAH DIBAYAR" ||
        installmentStatus === "SUDAH BAYAR" ||
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

    // ======================================
    // ANGSURAN BERIKUTNYA
    // ======================================

    let nextInstallment = unpaidRows[0] || null;

    if (unpaidRows.length && mingguHeader) {
      nextInstallment = [...unpaidRows].sort(
        (a, b) => toNumber(a[mingguHeader]) - toNumber(b[mingguHeader]),
      )[0];
    }

    // ======================================
    // DATA ANGSURAN BERIKUTNYA
    // ======================================

    let nextNumber = "-";
    let nextAmount = 0;
    let nextDueDate = "-";
    let nextPaymentDate = "-";

    if (nextInstallment) {
      if (mingguHeader) {
        nextNumber = nextInstallment[mingguHeader] || "-";
      }

      if (tagihanHeader) {
        nextAmount = toNumber(nextInstallment[tagihanHeader]);
      }

      if (jatuhTempoHeader) {
        nextDueDate = nextInstallment[jatuhTempoHeader] || "-";
      }

      if (pembayaranTanggalHeader) {
        nextPaymentDate = nextInstallment[pembayaranTanggalHeader] || "-";
      }
    }

    // ======================================
    // TOTAL
    // ======================================

    const totalInstallments = installments.length;

    const loanPaidPercentage =
      totalInstallments > 0
        ? Math.round((paidCount / totalInstallments) * 100)
        : 0;

    // ======================================
    // MESSAGE
    // ======================================

    let message =
      `👋 Halo ${name || "Anggota"}\n\n` +
      `📊 DATA PINJAMAN ANDA\n\n` +
      `🆔 User ID: ${userId}\n` +
      `💳 Pinjaman ID: ${loanId}\n` +
      `💰 Jumlah Pinjaman: ${rupiah(loanAmount)}\n` +
      `📆 Tenor: ${tenor} minggu\n` +
      `📌 Status: ${loanStatus}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📈 RIWAYAT ANGSURAN\n\n` +
      `✅ Sudah bayar: ${paidCount} kali\n` +
      `❌ Belum bayar: ${unpaidCount} kali\n` +
      `📊 Total angsuran: ${totalInstallments}\n` +
      `📈 Progress: ${loanPaidPercentage}%\n\n` +
      `💵 Total sudah dibayar: ${rupiah(totalPaid)}\n` +
      `💰 Sisa tagihan: ${rupiah(totalRemaining)}\n\n`;

    // ======================================
    // NEXT INSTALLMENT
    // ======================================

    if (nextInstallment) {
      message +=
        `━━━━━━━━━━━━━━━━━━\n` +
        `📋 ANGSURAN BERIKUTNYA\n\n` +
        `🔢 Angsuran: Minggu ${nextNumber}\n` +
        `💵 Tagihan: ${rupiah(nextAmount)}\n` +
        `📅 Jatuh tempo: ${nextDueDate}\n`;

      if (nextPaymentDate && nextPaymentDate !== "-") {
        message += `💳 Tanggal pembayaran: ${nextPaymentDate}\n`;
      }
    } else {
      message +=
        `━━━━━━━━━━━━━━━━━━\n` +
        `🎉 SEMUA ANGSURAN SUDAH LUNAS\n\n` +
        `Tidak ada tagihan angsuran berikutnya.`;
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
    console.error("❌ CHECK LOAN ERROR:", error);

    throw new Error("Gagal membaca data pinjaman dari Google Sheets.");
  }
}

export default {
  isLoanQuestion,
  checkLoan,
};
