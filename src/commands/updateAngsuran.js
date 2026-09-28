// Placeholder for updateAngsuran command
// This will be refactored from the legacy commands/updateAngsuran.js

export function isUpdateAngsuranCommand(text) {
  if (!text) return false;
  const normalized = String(text).toLowerCase().trim();
  return normalized.startsWith("/update") || normalized.startsWith("/angsuran");
}

export function isHelpUpdateAngsuranCommand(text) {
  if (!text) return false;
  const normalized = String(text).toLowerCase().trim();
  return (
    normalized === "/update-help" ||
    normalized === "/angsuran-help" ||
    normalized === "help update"
  );
}

export function getUpdateAngsuranHelp() {
  return (
    "📋 UPDATE ANGSURAN\n\n" +
    "Gunakan command:\n" +
    "/update USER_ID PINJAMAN_ID MINGGU STATUS\n\n" +
    "Contoh:\n" +
    "/update AGT001 PJM001 1 SUDAH DIBAYAR"
  );
}

export async function updateAngsuran(text, adminPhone) {
  // TODO: Implement update angsuran logic
  return {
    success: false,
    message: "⏳ Fitur update angsuran sedang dalam pengembangan.",
  };
}