export const VALID_HARI = ["SENIN","SELASA","RABU","KAMIS","JUMAT","SABTU"];

export const HARI_TO_KELOMPOK = {
  SENIN: "KLP001",
  SELASA: "KLP002",
  RABU: "KLP003",
  KAMIS: "KLP004",
  JUMAT: "KLP005",
  SABTU: "KLP006",
};

export const KELOMPOK_TO_HARI = Object.fromEntries(
  Object.entries(HARI_TO_KELOMPOK).map(([h,k])=>[k,h])
);

export function normalizeHari(v) {
  return String(v||"").trim().toUpperCase();
}

export function isValidHari(v) {
  return VALID_HARI.includes(normalizeHari(v));
}

export function getTodayHari() {
  const day = new Date().toLocaleDateString("id-ID",{timeZone:"Asia/Jakarta",weekday:"long"}).toUpperCase();
  if (day === "MINGGU") return "SENIN";
  return VALID_HARI.includes(day) ? day : "SENIN";
}

export function kelompokIdForHari(hari) {
  return HARI_TO_KELOMPOK[normalizeHari(hari)] || "";
}

export function hariForKelompok(kelompokId) {
  return KELOMPOK_TO_HARI[String(kelompokId||"").trim().toUpperCase()] || "";
}
