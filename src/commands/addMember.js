import "dotenv/config";
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { normalizePhone } from "../utils/phone.js";
import { rupiah } from "../utils/rupiah.js";
import { isValidHari, getTodayHari, kelompokIdForHari } from "../utils/hari.js";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const CREDENTIALS_PATH = process.env.GOOGLE_SHEET_CREDENTIALS;
const SHEET_ANGGOTA = process.env.SHEET_ANGGOTA || "ANGGOTA";
const SHEET_PINJAMAN = process.env.SHEET_PINJAMAN || "PINJAMAN";
const SHEET_ANGSURAN = process.env.SHEET_ANGSURAN || "ANGSURAN";
const SHEET_KELOMPOK = process.env.SHEET_KELOMPOK || "KELOMPOK_HARI";

import { ensureSheetsClient, getSpreadsheetId } from "../database/client.js";

let _cachedSheets = null;

function getAuth() {
  const sid = process.env.GOOGLE_SHEET_ID || getSpreadsheetId();
  if (!sid) {
    throw new Error("GOOGLE_SHEET_ID belum ada di .env");
  }

  const credPath = process.env.GOOGLE_SHEET_CREDENTIALS;
  if (!credPath || !String(credPath).trim()) {
    throw new Error("GOOGLE_SHEET_CREDENTIALS belum ada di .env");
  }

  const credentialPath = path.resolve(process.cwd(), credPath);

  if (!fs.existsSync(credentialPath) || fs.statSync(credentialPath).isDirectory()) {
    throw new Error(`File credential tidak ditemukan:\n${credentialPath}`);
  }

  let credentials;
  try {
    const raw = fs.readFileSync(credentialPath, "utf8");
    credentials = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `File credential bukan JSON yang valid:\n${credentialPath}`,
    );
  }

  if (!credentials.client_email) {
    throw new Error("client_email tidak ditemukan dalam credential Google.");
  }

  if (!credentials.private_key) {
    throw new Error("private_key tidak ditemukan dalam credential Google.");
  }

  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getSheets() {
  if (_cachedSheets) return _cachedSheets;
  try {
    _cachedSheets = ensureSheetsClient();
    return _cachedSheets;
  } catch (err) {
    const auth = getAuth();
    _cachedSheets = google.sheets({
      version: "v4",
      auth,
    });
    return _cachedSheets;
  }
}

async function getSheetRows(sheets, sheetName) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:Z`,
  });

  const values = result.data.values || [];

  if (values.length === 0) {
    throw new Error(`Sheet ${sheetName} kosong.`);
  }

  const headers = values[0].map((value) => String(value || "").trim());

  const rows = values.slice(1).map((row) => {
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = row[index] || "";
    });

    return obj;
  });

  return {
    headers,
    rows,
  };
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeNumber(value) {
  return Number(String(value ?? "").replace(/\D/g, ""));
}

function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value) || 0);
}

function formatDate(date) {
  const day = String(date.getDate()).padStart(2, "0");

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

function getTodayJakarta() {
  const now = new Date();

  const jakartaString = now.toLocaleString("en-US", {
    timeZone: "Asia/Jakarta",
  });

  return new Date(jakartaString);
}

function addDays(date, days) {
  const result = new Date(date);

  result.setDate(result.getDate() + days);

  return result;
}

function nextId(rows, field, prefix) {
  let max = 0;

  for (const row of rows) {
    const value = clean(row[field]);

    const match = value.match(new RegExp(`^${prefix}(\\d+)$`, "i"));

    if (match) {
      const number = Number(match[1]);

      if (number > max) {
        max = number;
      }
    }
  }

  return prefix + String(max + 1).padStart(3, "0");
}

function findHeader(headers, names) {
  for (const name of names) {
    const found = headers.find(
      (header) => clean(header).toUpperCase() === name.toUpperCase(),
    );

    if (found) {
      return found;
    }
  }

  return null;
}

function buildRow(headers, data) {
  return headers.map((header) => data[header] ?? "");
}

async function appendRow(sheets, sheetName, row) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,

    range: `${sheetName}!A:Z`,

    valueInputOption: "USER_ENTERED",

    insertDataOption: "INSERT_ROWS",

    requestBody: {
      values: [row],
    },
  });
}

async function appendRows(sheets, sheetName, rows) {
  if (!rows.length) {
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,

    range: `${sheetName}!A:Z`,

    valueInputOption: "USER_ENTERED",

    insertDataOption: "INSERT_ROWS",

    requestBody: {
      values: rows,
    },
  });
}

function parseAddCommand(text) {
  const command = String(text || "").trim();

  if (!command.toLowerCase().startsWith("/add")) {
    return null;
  }

  const content = command.slice(4).trim();

  const parts = content.split(/\s+/);

  if (parts.length < 5) {
    throw new Error(
      "Format salah.\n\n" +
        "Gunakan:\n" +
        "/add NAMA NO_WA PINJAMAN TENOR ANGSURAN [HARI]\n\n" +
        "Contoh:\n" +
        "/add jumiatun 6285712346523 1000000 6 130000 SENIN",
    );
  }

  const last = String(parts[parts.length - 1] || "").trim().toUpperCase();
  if (last === "MINGGU") {
    throw new Error("Hari MINGGU tidak tersedia. Pilih: SENIN, SELASA, RABU, KAMIS, JUMAT, SABTU.");
  }

  let hari = null;
  if (parts.length >= 6 && isValidHari(parts[parts.length - 1])) {
    hari = String(parts.pop()).trim().toUpperCase();
  }
  if (!hari) hari = getTodayHari();

  const installmentAmount = normalizeNumber(parts.pop());

  const tenor = normalizeNumber(parts.pop());

  const loanAmount = normalizeNumber(parts.pop());

  const phoneRaw = parts.pop();

  const name = parts.join(" ").trim();

  if (!name) {
    throw new Error("Nama anggota belum diisi.");
  }

  if (!phoneRaw) {
    throw new Error("Nomor WhatsApp belum diisi.");
  }

  const phone = normalizePhone(phoneRaw);

  if (!phone || phone.length < 10) {
    throw new Error("Nomor WhatsApp tidak valid.");
  }

  if (!loanAmount || loanAmount <= 0) {
    throw new Error("Nominal pinjaman tidak valid.");
  }

  if (!tenor || tenor <= 0) {
    throw new Error("Tenor tidak valid.");
  }

  if (!installmentAmount || installmentAmount <= 0) {
    throw new Error("Nominal angsuran tidak valid.");
  }

  return {
    name,
    phone,
    loanAmount,
    tenor,
    installmentAmount,
    hari,
  };
}

export async function addMember(text) {
  const data = parseAddCommand(text);

  if (!data) {
    return null;
  }

  console.log("\n================================");

  console.log("➕ COMMAND ADD ANGGOTA");

  console.log("================================");

  console.log("Nama:", data.name);

  console.log("No WA:", data.phone);

  console.log("Pinjaman:", formatRupiah(data.loanAmount));

  console.log("Tenor:", data.tenor);

  console.log("Angsuran:", formatRupiah(data.installmentAmount));

  console.log("🔄 Menghubungkan Google Sheets...");

  const sheets = await getSheets();

  console.log("✅ Google Sheets terhubung");

  const anggota = await getSheetRows(sheets, SHEET_ANGGOTA);

  const pinjaman = await getSheetRows(sheets, SHEET_PINJAMAN);

  const angsuran = await getSheetRows(sheets, SHEET_ANGSURAN);

  const phoneHeader = findHeader(anggota.headers, [
    "NO WA",
    "NO. WA",
    "NOMOR WA",
    "WHATSAPP",
    "NO WHATSAPP",
  ]);

  const userIdHeader = findHeader(anggota.headers, ["USER ID", "USER_ID"]);

  const nameHeader = findHeader(anggota.headers, ["NAMA", "NAMA ANGGOTA"]);

  const statusHeader = findHeader(anggota.headers, ["STATUS"]);
  const hariHeader = findHeader(anggota.headers, ["HARI TAGIHAN", "HARI", "HARI_TAGIHAN"]);
  const kelompokHeader = findHeader(anggota.headers, ["KELOMPOK ID", "KELOMPOK_ID", "KELOMPOK"]);
  const alamatHeader = findHeader(anggota.headers, ["ALAMAT"]);
  const tglDaftarHeader = findHeader(anggota.headers, ["TGL DAFTAR", "TGL_DAFTAR", "TANGGAL DAFTAR"]);

  if (!phoneHeader) {
    throw new Error("Kolom NO WA tidak ditemukan di Sheet ANGGOTA.");
  }

  if (!userIdHeader) {
    throw new Error("Kolom USER ID tidak ditemukan di Sheet ANGGOTA.");
  }

  const existingMember = anggota.rows.find(
    (row) => normalizePhone(row[phoneHeader]) === data.phone,
  );

  if (existingMember) {
    throw new Error(
      `Nomor ${data.phone} sudah terdaftar sebagai anggota ${existingMember[userIdHeader] || ""}.`,
    );
  }

  console.log("✅ Nomor WA belum terdaftar");

  const userId = nextId(anggota.rows, userIdHeader, "AGT");

  console.log("🆔 USER ID:", userId);

  const loanIdHeader = findHeader(pinjaman.headers, [
    "PINJAMAN ID",
    "PINJAMAN_ID",
  ]);

  const loanUserIdHeader = findHeader(pinjaman.headers, ["USER ID", "USER_ID"]);

  if (!loanIdHeader) {
    throw new Error("Kolom PINJAMAN ID tidak ditemukan di Sheet PINJAMAN.");
  }

  if (!loanUserIdHeader) {
    throw new Error("Kolom USER ID tidak ditemukan di Sheet PINJAMAN.");
  }

  const pinjamanId = nextId(pinjaman.rows, loanIdHeader, "PJM");

  console.log("💳 PINJAMAN ID:", pinjamanId);

  const today = getTodayJakarta();

  console.log("📅 Tanggal:", formatDate(today));

  const kelompokId = kelompokIdForHari(data.hari);
  console.log("📅 Hari Tagihan:", data.hari);
  console.log("👥 Kelompok:", kelompokId);

  const anggotaData = {};

  anggotaData[userIdHeader] = userId;

  if (nameHeader) {
    anggotaData[nameHeader] = data.name;
  }

  anggotaData[phoneHeader] = data.phone;

  if (statusHeader) {
    anggotaData[statusHeader] = "AKTIF";
  }

  if (hariHeader) {
    anggotaData[hariHeader] = data.hari;
  }

  if (kelompokHeader) {
    anggotaData[kelompokHeader] = kelompokId;
  }

  if (alamatHeader) {
    anggotaData[alamatHeader] = "-";
  }

  if (tglDaftarHeader) {
    anggotaData[tglDaftarHeader] = formatDate(today);
  }

  const anggotaRow = buildRow(anggota.headers, anggotaData);

  const pinjamanData = {};

  pinjamanData[loanUserIdHeader] = userId;

  pinjamanData[loanIdHeader] = pinjamanId;

  const amountHeader = findHeader(pinjaman.headers, [
    "PINJAMAN",
    "JUMLAH PINJAMAN",
    "NOMINAL PINJAMAN",
    "POKOK PINJAMAN",
    "JUMLAH",
  ]);

  const tenorHeader = findHeader(pinjaman.headers, [
    "TENOR",
    "LAMA",
    "TENOR MINGGU",
    "JUMLAH MINGGU",
  ]);

  const loanStatusHeader = findHeader(pinjaman.headers, ["STATUS"]);

  const loanDateHeader = findHeader(pinjaman.headers, [
    "TANGGAL PINJAMAN",
    "TANGGAL",
    "TANGGAL MULAI",
  ]);

  if (amountHeader) {
    pinjamanData[amountHeader] = data.loanAmount;
  }

  if (tenorHeader) {
    pinjamanData[tenorHeader] = data.tenor;
  }

  if (loanStatusHeader) {
    pinjamanData[loanStatusHeader] = "AKTIF";
  }

  if (loanDateHeader) {
    pinjamanData[loanDateHeader] = formatDate(today);
  }

  const pinjamanRow = buildRow(pinjaman.headers, pinjamanData);

  const angsuranUserIdHeader = findHeader(angsuran.headers, [
    "USER ID",
    "USER_ID",
  ]);

  const angsuranLoanIdHeader = findHeader(angsuran.headers, [
    "PINJAMAN ID",
    "PINJAMAN_ID",
  ]);

  const weekHeader = findHeader(angsuran.headers, ["MINGGU", "ANGSURAN", "KE"]);

  const dueDateHeader = findHeader(angsuran.headers, [
    "JATUH TEMPO",
    "JATUH_TEMPO",
    "TANGGAL JATUH TEMPO",
  ]);

  const billHeader = findHeader(angsuran.headers, [
    "TAGIHAN",
    "NOMINAL",
    "JUMLAH TAGIHAN",
  ]);

  const installmentStatusHeader = findHeader(angsuran.headers, ["STATUS"]);

  const paymentDateHeader = findHeader(angsuran.headers, [
    "TANGGAL PEMBAYARAN",
    "TANGGAL_PEMBAYARAN",
  ]);

  if (!angsuranUserIdHeader) {
    throw new Error("Kolom USER ID tidak ditemukan di Sheet ANGSURAN.");
  }

  if (!angsuranLoanIdHeader) {
    throw new Error("Kolom PINJAMAN ID tidak ditemukan di Sheet ANGSURAN.");
  }

  if (!weekHeader) {
    throw new Error("Kolom MINGGU tidak ditemukan di Sheet ANGSURAN.");
  }

  if (!dueDateHeader) {
    throw new Error("Kolom JATUH TEMPO tidak ditemukan di Sheet ANGSURAN.");
  }

  if (!billHeader) {
    throw new Error("Kolom TAGIHAN tidak ditemukan di Sheet ANGSURAN.");
  }

  const angsuranRows = [];

  for (let week = 1; week <= data.tenor; week++) {
    const dueDate = addDays(today, (week - 1) * 7);

    const rowData = {};

    rowData[angsuranUserIdHeader] = userId;

    rowData[angsuranLoanIdHeader] = pinjamanId;

    rowData[weekHeader] = week;

    rowData[dueDateHeader] = formatDate(dueDate);

    rowData[billHeader] = data.installmentAmount;

    if (installmentStatusHeader) {
      rowData[installmentStatusHeader] = "BELUM DIBAYAR";
    }

    if (paymentDateHeader) {
      rowData[paymentDateHeader] = "";
    }

    angsuranRows.push(buildRow(angsuran.headers, rowData));
  }

  console.log("📝 Menambahkan ANGGOTA...");

  await appendRow(sheets, SHEET_ANGGOTA, anggotaRow);

  console.log("✅ ANGGOTA berhasil");

  console.log("📝 Menambahkan PINJAMAN...");

  await appendRow(sheets, SHEET_PINJAMAN, pinjamanRow);

  console.log("✅ PINJAMAN berhasil");

  console.log(`📝 Membuat ${data.tenor} ANGSURAN...`);

  await appendRows(sheets, SHEET_ANGSURAN, angsuranRows);

  console.log("✅ ANGSURAN berhasil");

  console.log("\n================================");

  console.log("✅ SEMUA DATA BERHASIL DIBUAT");

  console.log("================================");

  return {
    success: true,

    userId,

    pinjamanId,

    name: data.name,

    phone: data.phone,

    loanAmount: data.loanAmount,

    tenor: data.tenor,

    installmentAmount: data.installmentAmount,

    hari: data.hari,

    kelompokId,

    firstDueDate: formatDate(today),

    lastDueDate: formatDate(addDays(today, (data.tenor - 1) * 7)),
  };
}