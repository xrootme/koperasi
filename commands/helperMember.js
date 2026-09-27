export function isHelpAddCommand(text) {
  const v = String(text || "").trim().toLowerCase();
  return (
    v === "/add" ||
    v === "/add help" ||
    v === "/help" ||
    v === "/help add" ||
    v === "/helper" ||
    v === "/helper add" ||
    v === "/bantuan" ||
    v === "/bantuan add" ||
    v === "cara add anggota" ||
    v === "bantuan add"
  );
}

export function getAddMemberHelp() {
  return (
    `📚 *BANTUAN TAMBAH ANGGOTA*\n\n` +
    `*Format:*\n` +
    `/add NAMA NO_WA PINJAMAN TENOR ANGSURAN [HARI]\n\n` +
    `*Keterangan:*\n` +
    `• NAMA - Nama lengkap (boleh spasi)\n` +
    `• NO_WA - Nomor WhatsApp diawali 62 (contoh 6285712346523)\n` +
    `• PINJAMAN - Jumlah pinjaman angka saja (contoh 1000000)\n` +
    `• TENOR - Lama pinjaman minggu (contoh 10)\n` +
    `• ANGSURAN - Tagihan per minggu angka saja (contoh 130000)\n` +
    `• HARI - Opsional: SENIN/SELASA/RABU/KAMIS/JUMAT/SABTU (default hari ini, MINGGU libur)\n\n` +
    `*Contoh:*\n` +
    `/add Jumiatun 6285712346523 1000000 10 130000 SENIN\n` +
    `/add Jumiatun 6285712346523 1000000 6 130000 SELASA\n` +
    `→ Jumiatun pinjam Rp1.000.000, tenor 10 minggu, angsuran Rp130.000/minggu, tagihan hari SENIN\n\n` +
    `*Kelompok otomatis:*\n` +
    `SENIN→KLP001 SELASA→KLP002 RABU→KLP003 KAMIS→KLP004 JUMAT→KLP005 SABTU→KLP006 (MINGGU libur)\n\n` +
    `*Catatan:*\n` +
    `• Hanya admin yang bisa pakai command ini\n` +
    `• Nomor WA tidak boleh sudah terdaftar\n` +
    `• Sistem otomatis buat USER ID (AGT001...), PINJAMAN ID (PJM001...), dan jadwal angsuran\n` +
    `• Kolom HARI TAGIHAN & KELOMPOK ID terisi otomatis\n` +
    `• Status awal angsuran: BELUM DIBAYAR\n\n` +
    `Ketik langsung \`/add ...\` dengan format di atas untuk eksekusi.`
  );
}

export default { isHelpAddCommand, getAddMemberHelp };
