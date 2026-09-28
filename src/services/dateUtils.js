export function formatDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

export function parsePaymentDate(dateStr) {
  if (!dateStr) return new Date();

  const parts = String(dateStr).split("/");
  if (parts.length !== 3) return new Date();

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);

  return new Date(year, month, day);
}

export function getTodayJakarta() {
  const now = new Date();
  const jakartaString = now.toLocaleString("en-US", {
    timeZone: "Asia/Jakarta",
  });
  return new Date(jakartaString);
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}