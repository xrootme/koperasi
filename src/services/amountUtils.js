export function normalizeNumber(value) {
  return Number(String(value ?? "").replace(/\D/g, ""));
}

export function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  const number = Number(String(value).replace(/[^\d-]/g, ""));

  return Number.isFinite(number) ? number : 0;
}