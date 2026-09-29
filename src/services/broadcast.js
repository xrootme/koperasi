import { config } from "../config/index.js";
import { readSheet, findHeaderIndex, toNumber, clean } from "../services/sheets.js";
import { normalizePhone } from "../utils/phone.js";
import { rupiah } from "../utils/rupiah.js";
import { getTodayJakarta } from "./dateUtils.js";
import { isHoliday } from "./holiday.js";

const {
  sheets: { anggota: SHEET_ANGGOTA, pinjaman: SHEET_PINJAMAN, angsuran: SHEET_ANGSURAN },
} = config;

export async function runBroadcast(sock) {
  try {
    const hariNow = new Date().toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", weekday: "long" }).toUpperCase();
    if (hariNow === "MINGGU") {
      console.log("[BROADCAST] Hari Minggu - broadcast dilewati");
      return { sent: 0, failed: 0, skipped: true, reason: "MINGGU" };
    }

    const todayJakarta = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    if (await isHoliday(todayJakarta)) {
      console.log("[BROADCAST] Tanggal merah/libur - broadcast dilewati");
      return { sent: 0, failed: 0, skipped: true, reason: "HOLIDAY" };
    }

    console.log("[BROADCAST] Starting daily broadcast...");

    const [anggotaSheet, pinjamanSheet, angsuranSheet] = await Promise.all([
      readSheet(SHEET_ANGGOTA),
      readSheet(SHEET_PINJAMAN),
      readSheet(SHEET_ANGSURAN),
    ]);

    const phoneIdx = findHeaderIndex(anggotaSheet.headers, ["NO WA", "NO. WA", "NOMOR WA", "NO WHATSAPP"]);
    const userIdIdx = findHeaderIndex(anggotaSheet.headers, ["USER ID", "USER_ID", "ID ANGGOTA"]);
    const nameIdx = findHeaderIndex(anggotaSheet.headers, ["NAMA", "NAMA ANGGOTA"]);
    const statusIdx = findHeaderIndex(anggotaSheet.headers, ["STATUS"]);

    if (phoneIdx === -1 || userIdIdx === -1) {
      throw new Error("Header NO WA / USER ID tidak ditemukan");
    }

    const loanUserIdIdx = findHeaderIndex(pinjamanSheet.headers, ["USER ID", "USER_ID", "ID ANGGOTA"]);
    const loanIdIdx = findHeaderIndex(pinjamanSheet.headers, ["PINJAMAN ID", "ID PINJAMAN", "LOAN ID"]);
    const loanAmountIdx = findHeaderIndex(pinjamanSheet.headers, ["PINJAMAN", "JUMLAH PINJAMAN", "NOMINAL PINJAMAN", "JUMLAH"]);
    const loanStatusIdx = findHeaderIndex(pinjamanSheet.headers, ["STATUS", "STATUS PINJAMAN"]);

    const anUserIdIdx = findHeaderIndex(angsuranSheet.headers, ["USER ID", "USER_ID", "ID ANGGOTA"]);
    const anLoanIdIdx = findHeaderIndex(angsuranSheet.headers, ["PINJAMAN ID", "ID PINJAMAN", "LOAN ID"]);
    const weekIdx = findHeaderIndex(angsuranSheet.headers, ["MINGGU", "ANGSURAN", "KE"]);
    const billIdx = findHeaderIndex(angsuranSheet.headers, ["TAGIHAN", "NOMINAL", "JUMLAH", "CICILAN"]);
    const statusAnIdx = findHeaderIndex(angsuranSheet.headers, ["STATUS", "STATUS ANGSURAN"]);
    const dueIdx = findHeaderIndex(angsuranSheet.headers, ["JATUH TEMPO", "JATUH TEMPO TANGGAL", "DUE DATE"]);

    let sent = 0;
    let failed = 0;

    for (const member of anggotaSheet.data) {
      const phone = normalizePhone(member[anggotaSheet.headers[phoneIdx]]);
      const userId = String(member[anggotaSheet.headers[userIdIdx]] || "").trim();
      const name = nameIdx !== -1 ? String(member[anggotaSheet.headers[nameIdx]] || "").trim() : "";
      const status = statusIdx !== -1 ? String(member[anggotaSheet.headers[statusIdx]] || "").trim().toUpperCase() : "AKTIF";

      if (!phone || status !== "AKTIF") continue;

      const loans = pinjamanSheet.data.filter(
        (r) => String(r[pinjamanSheet.headers[loanUserIdIdx]] || "").trim().toUpperCase() === userId.toUpperCase()
      );

      if (!loans.length) continue;

      let loan = loans.find(
        (r) =>
          loanStatusIdx !== -1 &&
          String(r[pinjamanSheet.headers[loanStatusIdx]] || "").trim().toUpperCase() === "AKTIF"
      );
      if (!loan) loan = loans[loans.length - 1];

      const loanId = String(loan[pinjamanSheet.headers[loanIdIdx]] || "").trim();
      const loanAmount = loanAmountIdx !== -1 ? toNumber(loan[pinjamanSheet.headers[loanAmountIdx]]) : 0;

      const installments = angsuranSheet.data.filter(
        (r) =>
          String(r[angsuranSheet.headers[anUserIdIdx]] || "").trim().toUpperCase() === userId.toUpperCase() &&
          String(r[angsuranSheet.headers[anLoanIdIdx]] || "").trim().toUpperCase() === loanId.toUpperCase()
      );

      const paid = installments.filter((r) => {
        const st = statusAnIdx !== -1 ? String(r[angsuranSheet.headers[statusAnIdx]] || "").trim().toUpperCase() : "";
        return st === "SUDAH DIBAYAR" || st === "SUDAH BAYAR" || st === "PAID";
      });

      const unpaid = installments.filter((r) => {
        const st = statusAnIdx !== -1 ? String(r[angsuranSheet.headers[statusAnIdx]] || "").trim().toUpperCase() : "";
        return st !== "SUDAH DIBAYAR" && st !== "SUDAH BAYAR" && st !== "PAID";
      });

      const totalInstallments = installments.length;
      const paidCount = paid.length;
      const unpaidCount = unpaid.length;

      let totalPaidAmount = 0;
      let totalUnpaidAmount = 0;

      for (const r of paid) {
        totalPaidAmount += billIdx !== -1 ? toNumber(r[angsuranSheet.headers[billIdx]]) : 0;
      }

      for (const r of unpaid) {
        totalUnpaidAmount += billIdx !== -1 ? toNumber(r[angsuranSheet.headers[billIdx]]) : 0;
      }

      const progressPercent = totalInstallments > 0 ? Math.round((paidCount / totalInstallments) * 100) : 0;

      if (!unpaid.length) continue;

      unpaid.sort((a, b) => toNumber(a[angsuranSheet.headers[weekIdx]]) - toNumber(b[angsuranSheet.headers[weekIdx]]));
      const next = unpaid[0];

      const nextWeek = weekIdx !== -1 ? next[angsuranSheet.headers[weekIdx]] : "-";
      const nextAmount = billIdx !== -1 ? toNumber(next[angsuranSheet.headers[billIdx]]) : 0;
      const nextDue = dueIdx !== -1 ? next[angsuranSheet.headers[dueIdx]] : "-";

      const message =
        `SELAMAT PAGI ${name.toUpperCase()}\n\n` +
        `INFO ANGSURAN HARI INI\n\n` +
        `User ID: ${userId}\n` +
        `Pinjaman: ${loanId}\n` +
        `Total Pinjaman: ${rupiah(loanAmount)}\n\n` +
        `RINGKASAN PEMBAYARAN\n\n` +
        `Sudah Bayar: ${paidCount} angsuran\n` +
        `Total Dibayar: ${rupiah(totalPaidAmount)}\n\n` +
        `Belum Bayar: ${unpaidCount} angsuran\n` +
        `Total Kurang: ${rupiah(totalUnpaidAmount)}\n\n` +
        `Progress: ${progressPercent}% (${paidCount}/${totalInstallments})\n\n` +
        `ANGSURAN BERIKUTNYA\n` +
        `Angsuran ke-${nextWeek}\n` +
        `Tagihan: ${rupiah(nextAmount)}\n` +
        `Jatuh Tempo: ${nextDue}\n\n` +
        `Segera lakukan pembayaran sebelum jatuh tempo.\n` +
        `Kirim bukti transfer (foto) ke bot ini untuk verifikasi otomatis.\n\n` +
        `Salam,\nKoperasi`;

      try {
        await sock.sendMessage(`${phone}@s.whatsapp.net`, { text: message });
        sent++;
        console.log(`[BROADCAST] Sent to ${phone} (${userId})`);
      } catch (e) {
        failed++;
        console.error(`[BROADCAST] Failed to ${phone}:`, e.message);
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    console.log(`[BROADCAST] Done. Sent: ${sent}, Failed: ${failed}`);
    return { sent, failed };
  } catch (err) {
    console.error("[BROADCAST ERROR]", err);
    throw err;
  }
}

function getNextRunMs() {
  const now = new Date();
  const jakarta = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const target = new Date(jakarta);
  target.setHours(8, 0, 0, 0);
  if (target <= jakarta) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

export function startScheduler(sock) {
  const run = async () => {
    try {
      await runBroadcast(sock);
    } catch (e) {
      console.error("[BROADCAST SCHEDULER]", e);
    }
    const ms = getNextRunMs();
    console.log(`[BROADCAST] Next run in ${Math.round(ms / 60000)} minutes`);
    setTimeout(run, ms);
  };

  const initialMs = getNextRunMs();
  console.log(`[BROADCAST] First run in ${Math.round(initialMs / 60000)} minutes`);
  setTimeout(run, initialMs);
}