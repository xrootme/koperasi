export { cleanUpper as clean } from "../utils/numbers.js";

export function parseAmount(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (value === null || value === undefined) {
    return 0;
  }

  const text = String(value)
    .trim()
    .replace(/rp/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, "");

  const amount = Number(text);

  return Number.isFinite(amount) ? amount : 0;
}
