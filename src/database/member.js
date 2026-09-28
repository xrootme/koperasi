import { getRows } from "./reader.js";
import { clean } from "./helpers.js";
import { normalizePhone } from "../utils/phone.js";

const SHEET_ANGGOTA = process.env.SHEET_ANGGOTA || "ANGGOTA";

export async function getMemberByPhone(phone) {
  const rows = await getRows(SHEET_ANGGOTA);

  const target = normalizePhone(phone);

  console.log(`[SHEETS] mencari anggota: ${target}`);

  if (!target) {
    return undefined;
  }

  if (!rows || !rows.length) {
    console.log(`[SHEETS] tidak ada data di sheet ANGGOTA`);
    return undefined;
  }

  // Cari nama kolom nomor telepon dengan beberapa kemungkinan variasi
  const possible = [
    "NO WA",
    "NO. WA",
    "NOMOR WA",
    "WHATSAPP",
    "NO WHATSAPP",
    "NO_WA",
    "PHONE",
    "TELEPON",
    "NO",
  ];

  const headers = Object.keys(rows[0] || {});

  let phoneHeader = headers.find((h) =>
    possible
      .map((p) => p.toUpperCase())
      .includes(clean(h).toUpperCase())
  );

  let member;

  if (phoneHeader) {
    member = rows.find((row) => normalizePhone(row[phoneHeader]) === target);
  } else {
    // Fallback: periksa semua cell pada setiap baris dan cari yang cocok
    member = rows.find((row) => {
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
    console.log(`[SHEETS] anggota ditemukan: ${member["USER ID"] || member["NAMA"] || target}`);
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