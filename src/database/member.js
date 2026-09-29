import { readSheet, clean } from "../services/sheets.js";
import { config } from "../config/index.js";

const {
  sheets: { anggota: SHEET_ANGGOTA },
} = config;

export { getMemberByPhone } from "./queries.js";

export async function getMemberByUserId(userId) {
  const { data } = await readSheet(SHEET_ANGGOTA);
  const target = clean(userId).toUpperCase();
  return data.find((row) => clean(row["USER ID"]).toUpperCase() === target);
}

export async function getMembersByHari(hari) {
  const { data } = await readSheet(SHEET_ANGGOTA);
  const target = String(hari || "").trim().toUpperCase();
  return data.filter(
    (r) => String(r["HARI TAGIHAN"] || r["HARI"] || "").trim().toUpperCase() === target,
  );
}

export async function getMembersByKelompok(kelompokId) {
  const { data } = await readSheet(SHEET_ANGGOTA);
  const target = String(kelompokId || "").trim().toUpperCase();
  return data.filter(
    (r) => String(r["KELOMPOK ID"] || "").trim().toUpperCase() === target,
  );
}

export async function getMembersGroupedByHari() {
  const { data } = await readSheet(SHEET_ANGGOTA);
  const groups = {};
  for (const r of data) {
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
