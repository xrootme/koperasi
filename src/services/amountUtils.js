export function parseAmount(value) {
  if (typeof value === "number") {
    return value;
  }

  if (value === null || value === undefined) {
    return 0;
  }

  let text = String(value).trim();

  text = text
    .replace(/rp/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, "");

  const amount = Number(text);

  return Number.isFinite(amount) ? amount : 0;
}

export function clean(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}