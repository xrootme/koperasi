import { getRows } from "./reader.js";
import { clean, columnLetter } from "./helpers.js";
import { sheets, spreadsheetId } from "./client.js";
import { normalizePhone } from "../utils/phone.js";

const SHEET_ANGGOTA = process.env.SHEET_ANGGOTA || "ANGGOTA";

export async function getMemberByPhone(phone) {
  const rows = await getRows(SHEET_ANGGOTA);

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

export async function getMemberByUserId(userId) {
  const rows = await getRows(SHEET_ANGGOTA);

  const target = clean(userId).toUpperCase();

  return rows.find((row) => clean(row["USER ID"]).toUpperCase() === target);
}

export async function getMembersByHari(hari) {
  const rows = await getRows(SHEET_ANGGOTA);
  const target = String(hari || "").trim().toUpperCase();
  return rows.filter((r) => String(r["HARI TAGIHAN"] || r["HARI"] || "").trim().toUpperCase() === target);
}

export async function getMembersByKelompok(kelompokId) {
  const rows = await getRows(SHEET_ANGGOTA);
  const target = String(kelompokId || "").trim().toUpperCase();
  return rows.filter((r) => String(r["KELOMPOK ID"] || "").trim().toUpperCase() === target);
}

export async function getMembersGroupedByHari() {
  const rows = await getRows(SHEET_ANGGOTA);
  const groups = {};
  for (const r of rows) {
    const hari = String(r["HARI TAGIHAN"] || r["HARI"] || "-").trim().toUpperCase() || "-";
    if (!groups[hari]) groups[hari] = [];
    groups[hari].push(r);
  }
  return groups;
}

export async function countMembersByHari() {
  const groups = await getMembersGroupedByHari();
  const counts = {};
  for (const [hari, list] of Object.entries(groups)) counts[hari] = list.length;
  return counts;
}