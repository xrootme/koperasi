export function parsePaymentDate(dateString) {
  if (dateString === null || dateString === undefined) {
    return null;
  }

  let value = String(dateString).trim().toLowerCase();

  if (!value) {
    return null;
  }

  let match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);

  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);

    let year = Number(match[3]);

    if (match[3].length === 2) {
      year += 2000;
    }

    return createValidDate(year, month, day);
  }

  match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    return createValidDate(year, month, day);
  }

  const months = {
    januari: 1,
    jan: 1,

    februari: 2,
    feb: 2,

    maret: 3,
    mar: 3,

    april: 4,
    apr: 4,

    mei: 5,
    may: 5,

    juni: 6,
    jun: 6,

    juli: 7,
    jul: 7,

    agustus: 8,
    agu: 8,
    agt: 8,
    aug: 8,

    september: 9,
    sep: 9,

    oktober: 10,
    okt: 10,
    oct: 10,

    november: 11,
    nov: 11,

    desember: 12,
    des: 12,
    dec: 12,
  };

  match = value.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);

  if (match) {
    const day = Number(match[1]);
    const monthName = match[2];
    const year = Number(match[3]);

    const month = months[monthName];

    if (!month) {
      return null;
    }

    return createValidDate(year, month, day);
  }

  return null;
}

function createValidDate(year, month, day) {
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return "";
  }

  const day = String(date.getDate()).padStart(2, "0");

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

export function getTodayJakarta() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());

  const day = parts.find((item) => item.type === "day")?.value;

  const month = parts.find((item) => item.type === "month")?.value;

  const year = parts.find((item) => item.type === "year")?.value;

  return `${day}/${month}/${year}`;
}

export function addDays(date, days) {
  const result = new Date(date);

  result.setDate(result.getDate() + days);

  return result;
}