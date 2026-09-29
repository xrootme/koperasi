export function clean(value) {
  return String(value ?? "").trim();
}

export function cleanUpper(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

export function normalizeNumber(value) {
  const n = Number(String(value ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value) || 0);
}

export function columnLetter(columnNumber) {
  let result = "";
  let n = columnNumber;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

export function findHeaderIndex(headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.findIndex(
      (h) => String(h).trim().toLowerCase() === alias.toLowerCase(),
    );
    if (idx !== -1) return idx;
  }
  return -1;
}

export function findHeader(headers, aliases) {
  const header = findHeaderIndex(headers, aliases);
  return header !== -1 ? headers[header] : null;
}
