const CACHE = new Map();

const API_URL = (year) => `https://api-harilibur.vercel.app/api?year=${year}`;
const FALLBACK_URL = `https://raw.githubusercontent.com/guangrei/HariLibur-Indonesia-JSON/master/hari-libur.json`;

async function fetchYear(year) {
  if (CACHE.has(year)) return CACHE.get(year);
  try {
    const res = await fetch(API_URL(year), { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      const set = new Set(data.filter(d => d.is_national_holiday).map(d => d.holiday_date));
      CACHE.set(year, set);
      return set;
    }
  } catch {}
  try {
    const res = await fetch(FALLBACK_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      const set = new Set(Object.keys(data).filter(k => k.startsWith(String(year))));
      CACHE.set(year, set);
      return set;
    }
  } catch {}
  const empty = new Set();
  CACHE.set(year, empty);
  return empty;
}

function toKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

export async function isHoliday(date) {
  const d = new Date(date);
  const key = toKey(d);
  const set = await fetchYear(d.getFullYear());
  if (set.has(key)) return true;
  const dow = d.toLocaleDateString("id-ID",{timeZone:"Asia/Jakarta",weekday:"long"}).toUpperCase();
  if (dow === "MINGGU") return true;
  return false;
}

export async function isTanggalMerah(date) {
  return isHoliday(date);
}

export async function nextBusinessDay(date) {
  let d = new Date(date);
  while (await isHoliday(d)) {
    d.setDate(d.getDate()+1);
  }
  return d;
}

export function clearHolidayCache(){ CACHE.clear(); }
