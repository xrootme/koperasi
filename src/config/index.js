import dotenv from "dotenv";

dotenv.config();

export const config = {
  google: {
    sheetId: process.env.GOOGLE_SHEET_ID || "",
    credentialsPath: process.env.GOOGLE_SHEET_CREDENTIALS || "./credentials/google-service-account.json",
  },

  sheets: {
    anggota: process.env.SHEET_ANGGOTA || "ANGGOTA",
    pinjaman: process.env.SHEET_PINJAMAN || "PINJAMAN",
    angsuran: process.env.SHEET_ANGSURAN || "ANGSURAN",
    pembayaran: process.env.SHEET_PEMBAYARAN || "PEMBAYARAN",
    kelompokHari: process.env.SHEET_KELOMPOK || "KELOMPOK_HARI",
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    maxBytes: 8 * 1024 * 1024,
  },

  admin: {
    phones: (process.env.ADMIN_PHONES || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    secret: process.env.ADMIN_SECRET || "",
  },

  bot: {
    name: "Koperasi Bot",
    version: "1.0.0",
  },

  rateLimit: {
    global: { limit: 30, windowMs: 60_000 },
    add: { limit: 5, windowMs: 60_000 },
    update: { limit: 10, windowMs: 60_000 },
    image: { limit: 5, windowMs: 60_000 },
  },
};

export function validateConfig() {
  const errors = [];

  if (!config.google.sheetId) {
    errors.push("GOOGLE_SHEET_ID is required");
  }

  if (!config.google.credentialsPath) {
    errors.push("GOOGLE_SHEET_CREDENTIALS is required");
  }

  if (!config.gemini.apiKey) {
    errors.push("GEMINI_API_KEY is required");
  }

  if (!config.admin.secret) {
    errors.push("ADMIN_SECRET is required");
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join("\n")}`);
  }

  return true;
}

export default config;