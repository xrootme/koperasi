import "dotenv/config";
import { config } from "../config/index.js";
import { STATUS } from "../config/sheetSchema.js";
import {
  readSheet,
  findHeader,
  findHeaderIndex,
  columnLetter,
  batchUpdate,
  clean,
} from "../services/sheets.js";
import { normalizePhone } from "../utils/phone.js";
import { rupiah } from "../utils/rupiah.js";
import { normalizeHari, isValidHari } from "../utils/hari.js";
import { getAdminPhones } from "../utils/adminAuth.js";

const {
  sheets: { anggota: SHEET_ANGGOTA, pinjaman: SHEET_PINJAMAN, angsuran: SHEET_ANGSURAN },
} = config;

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
    `BANTUAN UPDATE ANGSURAN\n\n` +
    `Format 1 - Per Anggota:\n` +
    `/update-angsuran NO_WA MINGGU STATUS\n\n` +
    `Format 2 - Per Hari (Bulk):\n` +
    `/update-angsuran HARI MINGGU STATUS\n\n` +
    `Keterangan:\n` +
    `• NO_WA - Nomor WhatsApp diawali 62 (contoh 6285712345678)\n` +
    `• HARI - SENIN / SELASA / RABU / KAMIS / JUMAT / SABTU (MINGGU libur)\n` +
    `• MINGGU - Nomor angsuran ke- (1..tenor)\n` +
    `• STATUS - SUDAH DIBAYAR | BELUM DIBAYAR (alias: LUNAS, SUDAH BAYAR)\n\n` +
    `Contoh:\n` +
    `/update-angsuran 6285712345678 1 SUDAH DIBAYAR\n` +
    `/update-angsuran 6285712345678 2 BELUM DIBAYAR\n` +
    `/update-angsuran SENIN 2 SUDAH DIBAYAR\n` +
    `/update-angsuran SELASA 1 BELUM DIBAYAR\n\n` +
    `Catatan:\n` +
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
  if (s === STATUS.ANGSURAN_LUNAS || s === "SUDAH BAYAR" || s === "LUNAS" || s === "PAID") {
    return STATUS.ANGSURAN_LUNAS;
  }
  if (s === STATUS.ANGSURAN_BELUM || s === "BELUM BAYAR" || s === "UNPAID") {
    return STATUS.ANGSURAN_BELUM;
  }
  throw new Error(`Status harus: ${STATUS.ANGSURAN_LUNAS} atau ${STATUS.ANGSURAN_BELUM}`);
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
    return { success: false, message: "Anda tidak memiliki izin untuk command ini." };
  }

  const parsed = parseUpdateCommand(text);

  const [anggotaSheet, pinjamanSheet, angsuranSheet] = await Promise.all([
    readSheet(SHEET_ANGGOTA),
    readSheet(SHEET_PINJAMAN),
    readSheet(SHEET_ANGSURAN),
  ]);

  const phoneIdx = findHeaderIndex(anggotaSheet.headers, [
    "NO WA", "NO. WA", "NOMOR WA", "NO WHATSAPP", "WHATSAPP", "PHONE", "TELEPON",
  ]);
  const userIdIdx = findHeaderIndex(anggotaSheet.headers, ["USER ID", "USER_ID", "ID ANGGOTA"]);
  const nameIdx = findHeaderIndex(anggotaSheet.headers, ["NAMA", "NAMA ANGGOTA"]);
  const hariIdx = findHeaderIndex(anggotaSheet.headers, ["HARI TAGIHAN", "HARI", "HARI_TAGIHAN"]);

  const anUserIdIdx = findHeaderIndex(angsuranSheet.headers, ["USER ID", "USER_ID", "ID ANGGOTA"]);
  const anLoanIdIdx = findHeaderIndex(angsuranSheet.headers, ["PINJAMAN ID", "ID PINJAMAN", "LOAN ID"]);
  const weekIdx = findHeaderIndex(angsuranSheet.headers, ["MINGGU", "ANGSURAN", "KE"]);
  const statusAnIdx = findHeaderIndex(angsuranSheet.headers, ["STATUS", "STATUS ANGSURAN"]);
  const billIdx = findHeaderIndex(angsuranSheet.headers, ["TAGIHAN", "NOMINAL", "JUMLAH", "CICILAN"]);
  const dueIdx = findHeaderIndex(angsuranSheet.headers, ["JATUH TEMPO", "JATUH TEMPO TANGGAL", "DUE DATE"]);
  const payDateIdx = findHeaderIndex(angsuranSheet.headers, ["TANGGAL PEMBAYARAN", "TANGGAL BAYAR", "PEMBAYARAN"]);

  const loanUserIdIdx = findHeaderIndex(pinjamanSheet.headers, ["USER ID", "USER_ID", "ID ANGGOTA"]);
  const loanIdIdx = findHeaderIndex(pinjamanSheet.headers, ["PINJAMAN ID", "ID PINJAMAN", "LOAN ID"]);
  const loanStatusIdx = findHeaderIndex(pinjamanSheet.headers, ["STATUS", "STATUS PINJAMAN"]);

  if (phoneIdx === -1 || userIdIdx === -1) throw new Error("Header NO WA / USER ID tidak ditemukan di sheet ANGGOTA.");
  if (weekIdx === -1 || statusAnIdx === -1) throw new Error("Header MINGGU atau STATUS tidak ditemukan di sheet ANGSURAN.");

  const isLoanActive = (loanRow, targetUserId) => {
    const uidMatches = String(loanRow[pinjamanSheet.headers[loanUserIdIdx]] || "").trim().toUpperCase() === targetUserId.toUpperCase();
    if (!uidMatches) return false;
    if (loanStatusIdx === -1) return true;
    const st = String(loanRow[pinjamanSheet.headers[loanStatusIdx]] || "").trim().toUpperCase();
    return st === "AKTIF" || st === "BERJALAN";
  };

  if (parsed.mode === "phone") {
    const { phone, week, status } = parsed;
    const member = anggotaSheet.data.find((r) => normalizePhone(r[anggotaSheet.headers[phoneIdx]]) === phone);
    if (!member) throw new Error(`Anggota dengan nomor ${phone} tidak ditemukan.`);

    const userId = String(member[anggotaSheet.headers[userIdIdx]] || "").trim();
    const name = nameIdx !== -1 ? String(member[anggotaSheet.headers[nameIdx]] || "").trim() : "";

    const loan = pinjamanSheet.data.find((r) => isLoanActive(r, userId));
    if (!loan) throw new Error(`Pinjaman aktif/berjalan untuk ${userId} tidak ditemukan.`);

    const loanId = String(loan[pinjamanSheet.headers[loanIdIdx]] || "").trim();
    const installment = angsuranSheet.data.find(
      (r) =>
        String(r[angsuranSheet.headers[anUserIdIdx]] || "").trim().toUpperCase() === userId.toUpperCase() &&
        String(r[angsuranSheet.headers[anLoanIdIdx]] || "").trim().toUpperCase() === loanId.toUpperCase() &&
        String(r[angsuranSheet.headers[weekIdx]] || "").trim() === String(week)
    );

    if (!installment) throw new Error(`Angsuran minggu ke-${week} untuk pinjaman ${loanId} tidak ditemukan.`);

    const rowNumber = installment.__rowNumber;
    const oldStatus = String(installment[angsuranSheet.headers[statusAnIdx]] || "").trim().toUpperCase();
    const billAmount = billIdx !== -1 ? Number(String(installment[angsuranSheet.headers[billIdx]] || "").replace(/[^\d]/g, "")) || 0 : 0;
    const dueDate = dueIdx !== -1 ? installment[angsuranSheet.headers[dueIdx]] : "-";

    if (oldStatus === status) {
      return { success: true, message: `Status angsuran minggu ke-${week} sudah ${status}. Tidak ada perubahan.`, userId, loanId, week, status };
    }

    const updates = [];
    updates.push({ range: `${columnLetter(statusAnIdx + 1)}${rowNumber}`, values: [[status]] });

    if (payDateIdx !== -1) {
      const val = status === "SUDAH DIBAYAR" ? getTodayJakarta() : "";
      updates.push({ range: `${columnLetter(payDateIdx + 1)}${rowNumber}`, values: [[val]] });
    }

    await batchUpdate(SHEET_ANGSURAN, updates);

    return {
      success: true,
      message:
        `ANGSURAN BERHASIL DIUPDATE\n\n` +
        `Nama: ${name}\n` +
        `User ID: ${userId}\n` +
        `Pinjaman: ${loanId}\n\n` +
        `Angsuran: Minggu ke-${week}\n` +
        `Tagihan: ${rupiah(billAmount)}\n` +
        `Jatuh Tempo: ${dueDate}\n\n` +
        `Status: ${oldStatus} -> ${status}` +
        (status === "SUDAH DIBAYAR" ? `\nTanggal Bayar: ${getTodayJakarta()}` : ""),
      userId,
      loanId,
      week,
      status,
      oldStatus,
    };
  }

  const { hari, week, status } = parsed;
  if (hariIdx === -1) throw new Error("Kolom HARI TAGIHAN tidak ditemukan di Sheet ANGGOTA.");

  const members = anggotaSheet.data.filter((r) => normalizeHari(r[anggotaSheet.headers[hariIdx]]) === hari);
  if (!members.length) throw new Error(`Tidak ada anggota dengan HARI TAGIHAN ${hari}.`);

  let ok = 0;
  let skip = 0;
  let notFound = 0;
  let noLoan = 0;
  const updates = [];
  const details = [];
  const fails = [];

  for (const m of members) {
    const userId = String(m[anggotaSheet.headers[userIdIdx]] || "").trim();
    const name = nameIdx !== -1 ? String(m[anggotaSheet.headers[nameIdx]] || "").trim() : userId;
    const phone = String(m[anggotaSheet.headers[phoneIdx]] || "").trim();

    const loan = pinjamanSheet.data.find((r) => isLoanActive(r, userId));
    if (!loan) {
      noLoan++;
      fails.push(`${name} (${phone}): tanpa pinjaman aktif`);
      continue;
    }

    const loanId = String(loan[pinjamanSheet.headers[loanIdIdx]] || "").trim();
    const inst = angsuranSheet.data.find(
      (r) =>
        String(r[angsuranSheet.headers[anUserIdIdx]] || "").trim().toUpperCase() === userId.toUpperCase() &&
        String(r[angsuranSheet.headers[anLoanIdIdx]] || "").trim().toUpperCase() === loanId.toUpperCase() &&
        String(r[angsuranSheet.headers[weekIdx]] || "").trim() === String(week)
    );

    if (!inst) {
      notFound++;
      fails.push(`${name} (${userId}): minggu ${week} tidak ada`);
      continue;
    }

    const old = String(inst[angsuranSheet.headers[statusAnIdx]] || "").trim().toUpperCase();
    if (old === status) {
      skip++;
      continue;
    }

    const rn = inst.__rowNumber;
    updates.push({ range: `${columnLetter(statusAnIdx + 1)}${rn}`, values: [[status]] });

    if (payDateIdx !== -1) {
      const val = status === "SUDAH DIBAYAR" ? getTodayJakarta() : "";
      updates.push({ range: `${columnLetter(payDateIdx + 1)}${rn}`, values: [[val]] });
    }

    ok++;
    if (details.length < 20) details.push(`${name} (${userId})`);
  }

  if (!updates.length) {
    if (skip && !notFound && !noLoan) {
      return { success: true, message: `Semua anggota Hari ${hari} minggu ke-${week} sudah berstatus ${status}.` };
    }
    throw new Error(`Tidak ada angsuran yang diupdate. Sudah sesuai: ${skip}, Tanpa pinjaman: ${noLoan}, Tidak ditemukan: ${notFound}`);
  }

  await batchUpdate(SHEET_ANGSURAN, updates);

  const msg =
    `UPDATE HARI ${hari} MINGGU KE-${week} -> ${status}\n\n` +
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