import "dotenv/config";
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { normalizePhone } from "../utils/phone.js";
import { rupiah } from "../utils/rupiah.js";
import { isValidHari, normalizeHari } from "../utils/hari.js";
import { ensureSheetsClient, getSpreadsheetId } from "../database/client.js";

const SHEET_ANGGOTA = process.env.SHEET_ANGGOTA || "ANGGOTA";
const SHEET_PINJAMAN = process.env.SHEET_PINJAMAN || "PINJAMAN";
const SHEET_ANGSURAN = process.env.SHEET_ANGSURAN || "ANGSURAN";

function getAdminPhones() {
  return (process.env.ADMIN_PHONES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function getSheets() {
  try {
    return ensureSheetsClient();
  } catch (err) {
    const credPath = process.env.GOOGLE_SHEET_CREDENTIALS;
    if (!credPath) throw new Error("GOOGLE_SHEET_CREDENTIALS belum diatur di .env");
    const resolved = path.resolve(process.cwd(), credPath);
    if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      throw new Error(`File credential tidak ditemukan di: ${resolved}`);
    }
    const credentials = JSON.parse(fs.readFileSync(resolved, "utf8"));
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    return google.sheets({ version: "v4", auth });
  }
}

async function readSheet(sheets, sheetName) {
  const sid = getSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `${sheetName}!A:Z`,
  });
  const rows = response.data.values || [];
  if (!rows.length) return { headers: [], data: [] };
  const headers = rows[0].map((h) => String(h || "").trim());
  const data = rows.slice(1).map((row, i) => {
    const obj = { __row: i + 2 };
    headers.forEach((h, j) => (obj[h] = row[j] || ""));
    return obj;
  });
  return { headers, data };
}

function findHeader(headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.findIndex(
      (h) => String(h).trim().toLowerCase() === alias.toLowerCase()
    );
    if (idx !== -1) return idx;
  }
  return -1;
}

function colLetter(idx) {
  let n = idx + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function getTodayJakarta() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const d = parts.find((p) => p.type === "day")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const y = parts.find((p) => p.type === "year")?.value;
  return `${d}/${m}/${y}`;
}

export function isUpdateAngsuranCommand(text) {
  const cmd = String(text || "").trim().toLowerCase();
  return cmd.startsWith("/update-angsuran") || cmd.startsWith("/update angsuran");
}

export function isHelpUpdateAngsuranCommand(text) {
  const v = String(text || "").trim().toLowerCase();
  return (
    v === "/update-angsuran" ||
    v === "/update angsuran" ||
    v === "/update-angsuran help" ||
    v === "/update angsuran help" ||
    v === "/help update-angsuran" ||
    v === "/help update angsuran" ||
    v === "/help angsuran" ||
    v === "/helper update-angsuran" ||
    v === "/helper angsuran" ||
    v === "/bantuan update-angsuran" ||
    v === "/bantuan angsuran" ||
    v === "/bantuan update angsuran" ||
    v === "cara update angsuran" ||
    v === "bantuan update angsuran"
  );
}

export function getUpdateAngsuranHelp() {
  return (
    `📚 *BANTUAN UPDATE ANGSURAN*\n\n` +
    `*Format 1 - Per Anggota:*\n` +
    `/update-angsuran NO_WA MINGGU STATUS\n\n` +
    `*Format 2 - Per Hari (Bulk):*\n` +
    `/update-angsuran HARI MINGGU STATUS\n\n` +
    `*Keterangan:*\n` +
    `• NO_WA - Nomor WhatsApp diawali 62 (contoh 6285712345678)\n` +
    `• HARI - SENIN / SELASA / RABU / KAMIS / JUMAT / SABTU (MINGGU libur)\n` +
    `• MINGGU - Nomor angsuran ke- (1..tenor)\n` +
    `• STATUS - SUDAH DIBAYAR | BELUM DIBAYAR (alias: LUNAS, SUDAH BAYAR)\n\n` +
    `*Contoh:*\n` +
    `/update-angsuran 6285712345678 1 SUDAH DIBAYAR\n` +
    `/update-angsuran 6285712345678 2 BELUM DIBAYAR\n` +
    `/update-angsuran SENIN 2 SUDAH DIBAYAR\n` +
    `/update-angsuran SELASA 1 BELUM DIBAYAR\n\n` +
    `*Catatan:*\n` +
    `• Hanya admin yang bisa memakai command ini\n` +
    `• Mode HARI akan mengupdate semua anggota dengan HARI TAGIHAN yang sama\n` +
    `• Kolom STATUS & TANGGAL PEMBAYARAN di Google Sheets terupdate otomatis`
  );
}

function helpText() {
  return (
    "Format salah.\n\n" +
    "Gunakan:\n" +
    "1) Per anggota:\n" +
    "/update-angsuran NO_WA MINGGU STATUS\n" +
    "2) Per hari (bulk):\n" +
    "/update-angsuran HARI MINGGU STATUS\n\n" +
    "Contoh:\n" +
    "/update-angsuran 6285712345678 1 SUDAH DIBAYAR\n" +
    "/update-angsuran SENIN 2 SUDAH DIBAYAR\n" +
    "/update-angsuran SELASA 1 BELUM DIBAYAR"
  );
}

function parseStatus(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (s === "SUDAH DIBAYAR" || s === "SUDAH BAYAR" || s === "LUNAS" || s === "PAID") return "SUDAH DIBAYAR";
  if (s === "BELUM DIBAYAR" || s === "BELUM BAYAR" || s === "UNPAID") return "BELUM DIBAYAR";
  throw new Error("Status harus: SUDAH DIBAYAR atau BELUM DIBAYAR");
}

function parseUpdateCommand(text) {
  const cmd = String(text || "").trim();
  const content = cmd.replace(/^\/update[-\s]angsuran\s+/i, "").trim();
  const parts = content.split(/\s+/);
  if (parts.length < 3) throw new Error(helpText());

  const first = normalizeHari(parts[0]);
  if (isValidHari(first)) {
    const hari = first;
    const week = parseInt(parts[1], 10);
    const status = parseStatus(parts.slice(2).join(" "));
    if (!week || week <= 0) throw new Error("Minggu tidak valid (harus angka positif).");
    return { mode: "hari", hari, week, status };
  }

  const phoneRaw = parts[0];
  const week = parseInt(parts[1], 10);
  const status = parseStatus(parts.slice(2).join(" "));
  if (!phoneRaw) throw new Error("Nomor WA belum diisi.");
  if (!week || week <= 0) throw new Error("Minggu tidak valid (harus angka positif).");

  const phone = normalizePhone(phoneRaw);
  if (!phone || phone.length < 10) throw new Error("Nomor WhatsApp tidak valid.");

  return { mode: "phone", phone, week, status };
}

export async function updateAngsuran(text, senderPhone) {
  const adminPhones = getAdminPhones();
  if (adminPhones.length && !adminPhones.includes(senderPhone)) {
    return { success: false, message: "❌ Anda tidak memiliki izin untuk command ini." };
  }

  const parsed = parseUpdateCommand(text);
  const sheets = await getSheets();
  const sid = getSpreadsheetId();

  const [anggotaSheet, pinjamanSheet, angsuranSheet] = await Promise.all([
    readSheet(sheets, SHEET_ANGGOTA),
    readSheet(sheets, SHEET_PINJAMAN),
    readSheet(sheets, SHEET_ANGSURAN),
  ]);

  const aHeaders = anggotaSheet.headers;
  const aData = anggotaSheet.data;
  const pHeaders = pinjamanSheet.headers;
  const pData = pinjamanSheet.data;
  const anHeaders = angsuranSheet.headers;
  const anData = angsuranSheet.data;

  const phoneIdx = findHeader(aHeaders, ["NO WA", "NO. WA", "NOMOR WA", "NO WHATSAPP", "WHATSAPP", "PHONE", "TELEPON"]);
  const userIdIdx = findHeader(aHeaders, ["USER ID", "USER_ID", "ID ANGGOTA"]);
  const nameIdx = findHeader(aHeaders, ["NAMA", "NAMA ANGGOTA"]);
  const hariIdx = findHeader(aHeaders, ["HARI TAGIHAN", "HARI", "HARI_TAGIHAN"]);

  const anUserIdIdx = findHeader(anHeaders, ["USER ID", "USER_ID", "ID ANGGOTA"]);
  const anLoanIdIdx = findHeader(anHeaders, ["PINJAMAN ID", "ID PINJAMAN", "LOAN ID"]);
  const weekIdx = findHeader(anHeaders, ["MINGGU", "ANGSURAN", "KE"]);
  const statusAnIdx = findHeader(anHeaders, ["STATUS", "STATUS ANGSURAN"]);
  const billIdx = findHeader(anHeaders, ["TAGIHAN", "NOMINAL", "JUMLAH", "CICILAN"]);
  const dueIdx = findHeader(anHeaders, ["JATUH TEMPO", "JATUH TEMPO TANGGAL", "DUE DATE"]);
  const payDateIdx = findHeader(anHeaders, ["TANGGAL PEMBAYARAN", "TANGGAL BAYAR", "PEMBAYARAN"]);

  const loanUserIdIdx = findHeader(pHeaders, ["USER ID", "USER_ID", "ID ANGGOTA"]);
  const loanIdIdx = findHeader(pHeaders, ["PINJAMAN ID", "ID PINJAMAN", "LOAN ID"]);
  const loanStatusIdx = findHeader(pHeaders, ["STATUS", "STATUS PINJAMAN"]);

  if (phoneIdx === -1 || userIdIdx === -1) throw new Error("Header NO WA / USER ID tidak ditemukan di sheet ANGGOTA.");
  if (weekIdx === -1 || statusAnIdx === -1) throw new Error("Header MINGGU atau STATUS tidak ditemukan di sheet ANGSURAN.");

  const isLoanActive = (loanRow, targetUserId) => {
    const uidMatches = String(loanRow[pHeaders[loanUserIdIdx]] || "").trim().toUpperCase() === targetUserId.toUpperCase();
    if (!uidMatches) return false;
    if (loanStatusIdx === -1) return true;
    const st = String(loanRow[pHeaders[loanStatusIdx]] || "").trim().toUpperCase();
    return st === "AKTIF" || st === "BERJALAN";
  };

  if (parsed.mode === "phone") {
    const { phone, week, status } = parsed;
    const member = aData.find((r) => normalizePhone(r[aHeaders[phoneIdx]]) === phone);
    if (!member) throw new Error(`Anggota dengan nomor ${phone} tidak ditemukan.`);

    const userId = String(member[aHeaders[userIdIdx]] || "").trim();
    const name = nameIdx !== -1 ? String(member[aHeaders[nameIdx]] || "").trim() : "";

    const loan = pData.find((r) => isLoanActive(r, userId));
    if (!loan) throw new Error(`Pinjaman aktif/berjalan untuk ${userId} tidak ditemukan.`);

    const loanId = String(loan[pHeaders[loanIdIdx]] || "").trim();
    const installment = anData.find(
      (r) =>
        String(r[anHeaders[anUserIdIdx]] || "").trim().toUpperCase() === userId.toUpperCase() &&
        String(r[anHeaders[anLoanIdIdx]] || "").trim().toUpperCase() === loanId.toUpperCase() &&
        String(r[anHeaders[weekIdx]] || "").trim() === String(week)
    );

    if (!installment) throw new Error(`Angsuran minggu ke-${week} untuk pinjaman ${loanId} tidak ditemukan.`);

    const rowNumber = installment.__row;
    const oldStatus = String(installment[anHeaders[statusAnIdx]] || "").trim().toUpperCase();
    const billAmount = billIdx !== -1 ? Number(String(installment[anHeaders[billIdx]] || "").replace(/[^\d]/g, "")) || 0 : 0;
    const dueDate = dueIdx !== -1 ? installment[anHeaders[dueIdx]] : "-";

    if (oldStatus === status) {
      return { success: true, message: `ℹ️ Status angsuran minggu ke-${week} sudah ${status}. Tidak ada perubahan.`, userId, loanId, week, status };
    }

    const updates = [];
    updates.push({
      range: `${SHEET_ANGSURAN}!${colLetter(statusAnIdx)}${rowNumber}`,
      values: [[status]],
    });

    if (payDateIdx !== -1) {
      const val = status === "SUDAH DIBAYAR" ? getTodayJakarta() : "";
      updates.push({
        range: `${SHEET_ANGSURAN}!${colLetter(payDateIdx)}${rowNumber}`,
        values: [[val]],
      });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sid,
      requestBody: { valueInputOption: "USER_ENTERED", data: updates },
    });

    return {
      success: true,
      message:
        `✅ ANGSURAN BERHASIL DIUPDATE\n\n` +
        `👤 Nama: ${name}\n` +
        `🆔 User ID: ${userId}\n` +
        `💳 Pinjaman: ${loanId}\n\n` +
        `📋 Angsuran: Minggu ke-${week}\n` +
        `💰 Tagihan: ${rupiah(billAmount)}\n` +
        `📆 Jatuh Tempo: ${dueDate}\n\n` +
        `🔄 Status: ${oldStatus} → ${status}` +
        (status === "SUDAH DIBAYAR" ? `\n📅 Tanggal Bayar: ${getTodayJakarta()}` : ""),
      userId,
      loanId,
      week,
      status,
      oldStatus,
    };
  }

  // MODE HARI
  const { hari, week, status } = parsed;
  if (hariIdx === -1) throw new Error("Kolom HARI TAGIHAN tidak ditemukan di Sheet ANGGOTA.");

  const members = aData.filter((r) => normalizeHari(r[aHeaders[hariIdx]]) === hari);
  if (!members.length) throw new Error(`Tidak ada anggota dengan HARI TAGIHAN ${hari}.`);

  let ok = 0;
  let skip = 0;
  let notFound = 0;
  let noLoan = 0;
  const updates = [];
  const details = [];
  const fails = [];

  for (const m of members) {
    const userId = String(m[aHeaders[userIdIdx]] || "").trim();
    const name = nameIdx !== -1 ? String(m[aHeaders[nameIdx]] || "").trim() : userId;
    const phone = String(m[aHeaders[phoneIdx]] || "").trim();

    const loan = pData.find((r) => isLoanActive(r, userId));
    if (!loan) {
      noLoan++;
      fails.push(`${name} (${phone}): tanpa pinjaman aktif`);
      continue;
    }

    const loanId = String(loan[pHeaders[loanIdIdx]] || "").trim();
    const inst = anData.find(
      (r) =>
        String(r[anHeaders[anUserIdIdx]] || "").trim().toUpperCase() === userId.toUpperCase() &&
        String(r[anHeaders[anLoanIdIdx]] || "").trim().toUpperCase() === loanId.toUpperCase() &&
        String(r[anHeaders[weekIdx]] || "").trim() === String(week)
    );

    if (!inst) {
      notFound++;
      fails.push(`${name} (${userId}): minggu ${week} tidak ada`);
      continue;
    }

    const old = String(inst[anHeaders[statusAnIdx]] || "").trim().toUpperCase();
    if (old === status) {
      skip++;
      continue;
    }

    const rn = inst.__row;
    updates.push({
      range: `${SHEET_ANGSURAN}!${colLetter(statusAnIdx)}${rn}`,
      values: [[status]],
    });

    if (payDateIdx !== -1) {
      const val = status === "SUDAH DIBAYAR" ? getTodayJakarta() : "";
      updates.push({
        range: `${SHEET_ANGSURAN}!${colLetter(payDateIdx)}${rn}`,
        values: [[val]],
      });
    }

    ok++;
    if (details.length < 20) details.push(`• ${name} (${userId})`);
  }

  if (!updates.length) {
    if (skip && !notFound && !noLoan) {
      return { success: true, message: `ℹ️ Semua anggota Hari ${hari} minggu ke-${week} sudah berstatus ${status}.` };
    }
    throw new Error(`Tidak ada angsuran yang diupdate. Sudah sesuai: ${skip}, Tanpa pinjaman: ${noLoan}, Tidak ditemukan: ${notFound}`);
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sid,
    requestBody: { valueInputOption: "USER_ENTERED", data: updates },
  });

  const msg =
    `✅ UPDATE HARI ${hari} MINGGU KE-${week} → ${status}\n\n` +
    `Total anggota ${hari}: ${members.length}\n` +
    `Berhasil diupdate: ${ok}\n` +
    `Sudah sesuai: ${skip}\n` +
    `Tanpa pinjaman aktif: ${noLoan}\n` +
    `Data tidak ditemukan: ${notFound}` +
    (details.length ? `\n\nDetail:\n` + details.join("\n") : "") +
    (fails.length ? `\n\nCatatan:\n` + fails.slice(0, 5).join("\n") + (fails.length > 5 ? `\n+${fails.length - 5} lainnya` : "") : "");

  return { success: true, message: msg, hari, week, status, ok, skip };
}

export default { isUpdateAngsuranCommand, isHelpUpdateAngsuranCommand, getUpdateAngsuranHelp, updateAngsuran };
