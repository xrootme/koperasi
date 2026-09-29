import "dotenv/config";
import fs from "fs";
import path from "path";
import { config } from "../config/index.js";
import { STATUS } from "../config/sheetSchema.js";
import {
  getSheetsClient,
  readSheet,
  appendRow,
  appendRows,
  findHeader,
  findHeaderIndex,
  columnLetter,
  clean,
  normalizeNumber,
  formatRupiah,
} from "../services/sheets.js";
import { normalizePhone } from "../utils/phone.js";
import { isValidHari, getTodayHari, kelompokIdForHari } from "../utils/hari.js";

const {
  sheets: { anggota: SHEET_ANGGOTA, pinjaman: SHEET_PINJAMAN, angsuran: SHEET_ANGSURAN, kelompokHari: SHEET_KELOMPOK },
} = config;

function formatDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function getTodayJakarta() {
  const now = new Date();
  const jakartaString = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
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
      if (number > max) max = number;
    }
  }
  return prefix + String(max + 1).padStart(3, "0");
}

function buildRow(headers, data) {
  return headers.map((header) => data[header] ?? "");
}

function parseAddCommand(text) {
  const command = String(text || "").trim();
  if (!command.toLowerCase().startsWith("/add")) return null;

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

  if (!name) throw new Error("Nama anggota belum diisi.");
  if (!phoneRaw) throw new Error("Nomor WhatsApp belum diisi.");

  const phone = normalizePhone(phoneRaw);
  if (!phone || phone.length < 10) throw new Error("Nomor WhatsApp tidak valid.");
  if (!loanAmount || loanAmount <= 0) throw new Error("Nominal pinjaman tidak valid.");
  if (!tenor || tenor <= 0) throw new Error("Tenor tidak valid.");
  if (!installmentAmount || installmentAmount <= 0) throw new Error("Nominal angsuran tidak valid.");

  return { name, phone, loanAmount, tenor, installmentAmount, hari };
}

export async function addMember(text) {
  const data = parseAddCommand(text);
  if (!data) return null;

  console.log("\n================================");
  console.log("COMMAND ADD ANGGOTA");
  console.log("================================");
  console.log("Nama:", data.name);
  console.log("No WA:", data.phone);
  console.log("Pinjaman:", formatRupiah(data.loanAmount));
  console.log("Tenor:", data.tenor);
  console.log("Angsuran:", formatRupiah(data.installmentAmount));

  const sheets = getSheetsClient();

  const [anggotaSheet, pinjamanSheet, angsuranSheet] = await Promise.all([
    readSheet(SHEET_ANGGOTA),
    readSheet(SHEET_PINJAMAN),
    readSheet(SHEET_ANGSURAN),
  ]);

  const phoneHeader = findHeader(anggotaSheet.headers, [
    "NO WA", "NO. WA", "NOMOR WA", "WHATSAPP", "NO WHATSAPP",
  ]);
  const userIdHeader = findHeader(anggotaSheet.headers, ["USER ID", "USER_ID"]);
  const nameHeader = findHeader(anggotaSheet.headers, ["NAMA", "NAMA ANGGOTA"]);
  const statusHeader = findHeader(anggotaSheet.headers, ["STATUS"]);
  const hariHeader = findHeader(anggotaSheet.headers, ["HARI TAGIHAN", "HARI", "HARI_TAGIHAN"]);
  const kelompokHeader = findHeader(anggotaSheet.headers, ["KELOMPOK ID", "KELOMPOK_ID", "KELOMPOK"]);
  const alamatHeader = findHeader(anggotaSheet.headers, ["ALAMAT"]);
  const tglDaftarHeader = findHeader(anggotaSheet.headers, ["TGL DAFTAR", "TGL_DAFTAR", "TANGGAL DAFTAR"]);

  if (!phoneHeader) throw new Error("Kolom NO WA tidak ditemukan di Sheet ANGGOTA.");
  if (!userIdHeader) throw new Error("Kolom USER ID tidak ditemukan di Sheet ANGGOTA.");

  const existingMember = anggotaSheet.data.find(
    (row) => normalizePhone(row[phoneHeader]) === data.phone,
  );

  if (existingMember) {
    throw new Error(`Nomor ${data.phone} sudah terdaftar sebagai anggota ${existingMember[userIdHeader] || ""}.`);
  }

  console.log("Nomor WA belum terdaftar");

  const userId = nextId(anggotaSheet.data, userIdHeader, "AGT");
  console.log("USER ID:", userId);

  const loanIdHeader = findHeader(pinjamanSheet.headers, ["PINJAMAN ID", "PINJAMAN_ID"]);
  const loanUserIdHeader = findHeader(pinjamanSheet.headers, ["USER ID", "USER_ID"]);

  if (!loanIdHeader) throw new Error("Kolom PINJAMAN ID tidak ditemukan di Sheet PINJAMAN.");
  if (!loanUserIdHeader) throw new Error("Kolom USER ID tidak ditemukan di Sheet PINJAMAN.");

  const pinjamanId = nextId(pinjamanSheet.data, loanIdHeader, "PJM");
  console.log("PINJAMAN ID:", pinjamanId);

  const today = getTodayJakarta();
  console.log("Tanggal:", formatDate(today));

  const kelompokId = kelompokIdForHari(data.hari);
  console.log("Hari Tagihan:", data.hari);
  console.log("Kelompok:", kelompokId);

  const anggotaData = {};
  anggotaData[userIdHeader] = userId;
  if (nameHeader) anggotaData[nameHeader] = data.name;
  anggotaData[phoneHeader] = data.phone;
  if (statusHeader) anggotaData[statusHeader] = STATUS.ANGGOTA_AKTIF;
  if (hariHeader) anggotaData[hariHeader] = data.hari;
  if (kelompokHeader) anggotaData[kelompokHeader] = kelompokId;
  if (alamatHeader) anggotaData[alamatHeader] = "-";
  if (tglDaftarHeader) anggotaData[tglDaftarHeader] = formatDate(today);

  const anggotaRow = buildRow(anggotaSheet.headers, anggotaData);

  const pinjamanData = {};
  pinjamanData[loanUserIdHeader] = userId;
  pinjamanData[loanIdHeader] = pinjamanId;

  const amountHeader = findHeader(pinjamanSheet.headers, [
    "PINJAMAN", "JUMLAH PINJAMAN", "NOMINAL PINJAMAN", "POKOK PINJAMAN", "JUMLAH",
  ]);
  const tenorHeader = findHeader(pinjamanSheet.headers, ["TENOR", "LAMA", "TENOR MINGGU", "JUMLAH MINGGU"]);
  const loanStatusHeader = findHeader(pinjamanSheet.headers, ["STATUS"]);
  const loanDateHeader = findHeader(pinjamanSheet.headers, ["TANGGAL PINJAMAN", "TGL PINJAMAN", "TANGGAL", "TANGGAL MULAI"]);

  if (amountHeader) pinjamanData[amountHeader] = data.loanAmount;
  if (tenorHeader) pinjamanData[tenorHeader] = data.tenor;
  if (loanStatusHeader) pinjamanData[loanStatusHeader] = STATUS.PINJAMAN_BERJALAN;
  if (loanDateHeader) pinjamanData[loanDateHeader] = formatDate(today);

  const pinjamanRow = buildRow(pinjamanSheet.headers, pinjamanData);

  const angsuranUserIdHeader = findHeader(angsuranSheet.headers, ["USER ID", "USER_ID"]);
  const angsuranLoanIdHeader = findHeader(angsuranSheet.headers, ["PINJAMAN ID", "PINJAMAN_ID"]);
  const weekHeader = findHeader(angsuranSheet.headers, ["MINGGU", "ANGSURAN", "KE"]);
  const dueDateHeader = findHeader(angsuranSheet.headers, ["JATUH TEMPO", "JATUH_TEMPO", "TANGGAL JATUH TEMPO"]);
  const billHeader = findHeader(angsuranSheet.headers, ["TAGIHAN", "NOMINAL", "JUMLAH TAGIHAN"]);
  const installmentStatusHeader = findHeader(angsuranSheet.headers, ["STATUS"]);
  const paymentDateHeader = findHeader(angsuranSheet.headers, ["TANGGAL PEMBAYARAN", "TANGGAL_PEMBAYARAN", "TANGGAL BAYAR"]);

  if (!angsuranUserIdHeader) throw new Error("Kolom USER ID tidak ditemukan di Sheet ANGSURAN.");
  if (!angsuranLoanIdHeader) throw new Error("Kolom PINJAMAN ID tidak ditemukan di Sheet ANGSURAN.");
  if (!weekHeader) throw new Error("Kolom MINGGU tidak ditemukan di Sheet ANGSURAN.");
  if (!dueDateHeader) throw new Error("Kolom JATUH TEMPO tidak ditemukan di Sheet ANGSURAN.");
  if (!billHeader) throw new Error("Kolom TAGIHAN tidak ditemukan di Sheet ANGSURAN.");

  const angsuranRows = [];
  for (let week = 1; week <= data.tenor; week++) {
    const dueDate = addDays(today, (week - 1) * 7);
    const rowData = {};
    rowData[angsuranUserIdHeader] = userId;
    rowData[angsuranLoanIdHeader] = pinjamanId;
    rowData[weekHeader] = week;
    rowData[dueDateHeader] = formatDate(dueDate);
    rowData[billHeader] = data.installmentAmount;
    if (installmentStatusHeader) rowData[installmentStatusHeader] = STATUS.ANGSURAN_BELUM;
    if (paymentDateHeader) rowData[paymentDateHeader] = "";
    angsuranRows.push(buildRow(angsuranSheet.headers, rowData));
  }

  console.log("Menambahkan ANGGOTA...");
  await appendRow(SHEET_ANGGOTA, anggotaRow);
  console.log("ANGGOTA berhasil");

  console.log("Menambahkan PINJAMAN...");
  await appendRow(SHEET_PINJAMAN, pinjamanRow);
  console.log("PINJAMAN berhasil");

  console.log(`Membuat ${data.tenor} ANGSURAN...`);
  await appendRows(SHEET_ANGSURAN, angsuranRows);
  console.log("ANGSURAN berhasil");

  console.log("\n================================");
  console.log("SEMUA DATA BERHASIL DIBUAT");
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