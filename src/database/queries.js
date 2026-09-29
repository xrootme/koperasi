import { config } from "../config/index.js";
import { readSheet, clean } from "../services/sheets.js";
import { normalizePhone } from "../utils/phone.js";

const {
  sheets: { anggota: SHEET_ANGGOTA, pinjaman: SHEET_PINJAMAN, angsuran: SHEET_ANGSURAN },
} = config;

export async function getMemberByPhone(phone) {
  const anggotaSheet = await readSheet(SHEET_ANGGOTA);

  const target = normalizePhone(phone);
  if (!target) return undefined;

  const possible = [
    "NO WA", "NO. WA", "NOMOR WA", "WHATSAPP", "NO WHATSAPP",
    "NO_WA", "PHONE", "TELEPON", "NO",
  ];

  const phoneHeader = anggotaSheet.headers.find((h) =>
    possible.map((p) => p.toUpperCase()).includes(clean(h).toUpperCase())
  );

  let member;

  if (phoneHeader) {
    member = anggotaSheet.data.find((row) => normalizePhone(row[phoneHeader]) === target);
  } else {
    member = anggotaSheet.data.find((row) => {
      for (const key of Object.keys(row)) {
        if (key === "__rowNumber") continue;
        const val = row[key];
        if (!val) continue;
        if (normalizePhone(val) === target) return true;
      }
      return false;
    });
  }

  if (member) {
    console.log("[SHEETS] anggota ditemukan:", member["USER ID"] || member["NAMA"] || target);
  } else {
    console.log("[SHEETS] anggota tidak ditemukan:", target);
  }

  return member;
}

export async function getActiveLoan(userId) {
  const pinjamanSheet = await readSheet(SHEET_PINJAMAN);

  const target = clean(userId).toUpperCase();

  return pinjamanSheet.data.find((row) => {
    const isUser = clean(row["USER ID"]).toUpperCase() === target;
    const status = clean(row["STATUS"]).toUpperCase();
    return isUser && (status === "BERJALAN" || status === "AKTIF");
  });
}

export async function getNextInstallment(userId, loanId) {
  const angsuranSheet = await readSheet(SHEET_ANGSURAN);

  const targetUser = clean(userId).toUpperCase();
  const targetLoan = clean(loanId).toUpperCase();

  return angsuranSheet.data
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
  const angsuranSheet = await readSheet(SHEET_ANGSURAN);

  const targetUser = clean(userId).toUpperCase();
  const targetLoan = clean(loanId).toUpperCase();

  return angsuranSheet.data
    .filter(
      (row) =>
        clean(row["USER ID"]).toUpperCase() === targetUser &&
        clean(row["PINJAMAN ID"]).toUpperCase() === targetLoan
    )
    .sort((a, b) => Number(a["MINGGU"] || 0) - Number(b["MINGGU"] || 0));
}