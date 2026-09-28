import { getRows } from "../database/reader.js";
import { clean, columnLetter } from "../database/helpers.js";
import { sheets } from "../database/client.js";
import { normalizePhone } from "../utils/phone.js";
import { rupiah } from "../utils/rupiah.js";
import { getTodayJakarta } from "./dateUtils.js";
import { isHoliday } from "./holiday.js";

const SHEET_ANGGOTA = process.env.SHEET_ANGGOTA || "ANGGOTA";
const SHEET_PINJAMAN = process.env.SHEET_PINJAMAN || "PINJAMAN";
const SHEET_ANGSURAN = process.env.SHEET_ANGSURAN || "ANGSURAN";

function findHeader(headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.findIndex(
      (h) => String(h).trim().toLowerCase() === alias.toLowerCase()
    );
    if (idx !== -1) return idx;
  }
  return -1;
}

function toNumber(v) {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^\d-]/g, ""));
  return isFinite(n) ? n : 0;
}

export async function runBroadcast(sock) {
  try {
    const hariNow = new Date().toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", weekday: "long" }).toUpperCase();
    if (hariNow === "MINGGU") {
      console.log("[BROADCAST] Hari Minggu — broadcast dilewati");
      return { sent: 0, failed: 0, skipped: true, reason: "MINGGU" };
    }

    const todayJakarta = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    if (await isHoliday(todayJakarta)) {
      console.log("[BROADCAST] Tanggal merah/libur — broadcast dilewati");
      return { sent: 0, failed: 0, skipped: true, reason: "HOLIDAY" };
    }

    console.log("[BROADCAST] Starting daily broadcast...");

    const [anggotaSheet, pinjamanSheet, angsuranSheet] = await Promise.all([
      getRows(SHEET_ANGGOTA),
      getRows(SHEET_PINJAMAN),
      getRows(SHEET_ANGSURAN),
    ]);

    const aHeaders = Object.keys(anggotaSheet[0] || {}).filter(k => k !== '__rowNumber');
    const aData = anggotaSheet;

    const phoneIdx = findHeader(aHeaders, ["NO WA", "NO. WA", "NOMOR WA", "NO WHATSAPP"]);
    const userIdIdx = findHeader(aHeaders, ["USER ID", "USER_ID", "ID ANGGOTA"]);
    const nameIdx = findHeader(aHeaders, ["NAMA", "NAMA ANGGOTA"]);
    const statusIdx = findHeader(aHeaders, ["STATUS"]);

    if (phoneIdx === -1 || userIdIdx === -1) {
      throw new Error("Header NO WA / USER ID tidak ditemukan");
    }

    const pHeaders = Object.keys(pinjamanSheet[0] || {}).filter(k => k !== '__rowNumber');
    const pData = pinjamanSheet;
    const loanUserIdIdx = findHeader(pHeaders, ["USER ID", "USER_ID", "ID ANGGOTA"]);
    const loanIdIdx = findHeader(pHeaders, ["PINJAMAN ID", "ID PINJAMAN", "LOAN ID"]);
    const loanAmountIdx = findHeader(pHeaders, ["PINJAMAN", "JUMLAH PINJAMAN", "NOMINAL PINJAMAN", "JUMLAH"]);
    const loanStatusIdx = findHeader(pHeaders, ["STATUS", "STATUS PINJAMAN"]);

    const anHeaders = Object.keys(angsuranSheet[0] || {}).filter(k => k !== '__rowNumber');
    const anData = angsuranSheet;
    const anUserIdIdx = findHeader(anHeaders, ["USER ID", "USER_ID", "ID ANGGOTA"]);
    const anLoanIdIdx = findHeader(anHeaders, ["PINJAMAN ID", "ID PINJAMAN", "LOAN ID"]);
    const weekIdx = findHeader(anHeaders, ["MINGGU", "ANGSURAN", "KE"]);
    const billIdx = findHeader(anHeaders, ["TAGIHAN", "NOMINAL", "JUMLAH", "CICILAN"]);
    const statusAnIdx = findHeader(anHeaders, ["STATUS", "STATUS ANGSURAN"]);
    const dueIdx = findHeader(anHeaders, ["JATUH TEMPO", "JATUH TEMPO TANGGAL", "DUE DATE"]);

    let sent = 0;
    let failed = 0;

    for (const member of aData) {
      const phone = normalizePhone(member[aHeaders[phoneIdx]]);
      const userId = String(member[aHeaders[userIdIdx]] || "").trim();
      const name = nameIdx !== -1 ? String(member[aHeaders[nameIdx]] || "").trim() : "";
      const status = statusIdx !== -1 ? String(member[aHeaders[statusIdx]] || "").trim().toUpperCase() : "AKTIF";

      if (!phone || status !== "AKTIF") continue;

      const loans = pData.filter(
        (r) => String(r[pHeaders[loanUserIdIdx]] || "").trim().toUpperCase() === userId.toUpperCase()
      );

      if (!loans.length) continue;

      let loan = loans.find(
        (r) =>
          loanStatusIdx !== -1 &&
          String(r[pHeaders[loanStatusIdx]] || "").trim().toUpperCase() === "AKTIF"
      );
      if (!loan) loan = loans[loans.length - 1];

      const loanId = String(loan[pHeaders[loanIdIdx]] || "").trim();
      const loanAmount = loanAmountIdx !== -1 ? toNumber(loan[pHeaders[loanAmountIdx]]) : 0;

      const installments = anData.filter(
        (r) =>
          String(r[anHeaders[anUserIdIdx]] || "").trim().toUpperCase() === userId.toUpperCase() &&
          String(r[anHeaders[anLoanIdIdx]] || "").trim().toUpperCase() === loanId.toUpperCase()
      );

      const paid = installments.filter((r) => {
        const st = statusAnIdx !== -1 ? String(r[anHeaders[statusAnIdx]] || "").trim().toUpperCase() : "";
        return st === "SUDAH DIBAYAR" || st === "SUDAH BAYAR" || st === "PAID";
      });

      const unpaid = installments.filter((r) => {
        const st = statusAnIdx !== -1 ? String(r[anHeaders[statusAnIdx]] || "").trim().toUpperCase() : "";
        return st !== "SUDAH DIBAYAR" && st !== "SUDAH BAYAR" && st !== "PAID";
      });

      const totalInstallments = installments.length;
      const paidCount = paid.length;
      const unpaidCount = unpaid.length;

      let totalPaidAmount = 0;
      let totalUnpaidAmount = 0;

      for (const r of paid) {
        totalPaidAmount += billIdx !== -1 ? toNumber(r[anHeaders[billIdx]]) : 0;
      }

      for (const r of unpaid) {
        totalUnpaidAmount += billIdx !== -1 ? toNumber(r[anHeaders[billIdx]]) : 0;
      }

      const progressPercent = totalInstallments > 0 ? Math.round((paidCount / totalInstallments) * 100) : 0;

      if (!unpaid.length) continue;

      unpaid.sort((a, b) => toNumber(a[anHeaders[weekIdx]]) - toNumber(b[anHeaders[weekIdx]]));
      const next = unpaid[0];

      const nextWeek = weekIdx !== -1 ? next[anHeaders[weekIdx]] : "-";
      const nextAmount = billIdx !== -1 ? toNumber(next[anHeaders[billIdx]]) : 0;
      const nextDue = dueIdx !== -1 ? next[anHeaders[dueIdx]] : "-";

      const message =
        `🌅 SELAMAT PAGI ${name.toUpperCase()}\n\n` +
        `📋 INFO ANGSURAN HARI INI\n\n` +
        `🆔 User ID: ${userId}\n` +
        `💳 Pinjaman: ${loanId}\n` +
        `💰 Total Pinjaman: ${rupiah(loanAmount)}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📈 RINGKASAN PEMBAYARAN\n\n` +
        `✅ Sudah Bayar: ${paidCount} angsuran\n` +
        `💵 Total Dibayar: ${rupiah(totalPaidAmount)}\n\n` +
        `❌ Belum Bayar: ${unpaidCount} angsuran\n` +
        `💰 Total Kurang: ${rupiah(totalUnpaidAmount)}\n\n` +
        `📊 Progress: ${progressPercent}% (${paidCount}/${totalInstallments})\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `📅 ANGSURAN BERIKUTNYA\n` +
        `🔢 Angsuran ke-${nextWeek}\n` +
        `💵 Tagihan: ${rupiah(nextAmount)}\n` +
        `📆 Jatuh Tempo: ${nextDue}\n\n` +
        `💡 Segera lakukan pembayaran sebelum jatuh tempo.\n` +
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
  const jakarta = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );
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