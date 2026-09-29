import { config } from "../config/index.js";
import { getMessagePhone } from "../utils/phone.js";
import { isMessageProcessed, isImageProcessed, markProcessed, getImageHash } from "../utils/processedMessages.js";
import { allow } from "../utils/rateLimiter.js";
import { maskPhone, maskId, maskText } from "../utils/logger.js";
import { analyzeTransferImage } from "../ai/gemini.js";
import { processPayment } from "../services/paymentProcessor.js";
import { addMember } from "../commands/addMember.js";
import { isHelpAddCommand, getAddMemberHelp } from "../commands/helperMember.js";
import { checkLoan, isLoanQuestion } from "../commands/checkLoan.js";
import { updateAngsuran, isHelpUpdateAngsuranCommand, isUpdateAngsuranCommand, getUpdateAngsuranHelp } from "../commands/updateAngsuran.js";
import { isAdminPhone } from "../utils/adminAuth.js";
import { getMemberByPhone, getActiveLoan, getNextInstallment } from "../database/queries.js";
import { unwrapMessage, safeSendMessage, cleanupOldSocket, downloadMediaMessageSafe } from "./socketHelpers.js";
import { GEMINI_MAX_BYTES } from "./constants.js";

export async function handleMessage(sock, msg) {
  if (!msg) return;
  if (msg.key?.fromMe) return;

  const senderJid = msg.key?.remoteJid;
  if (!senderJid || senderJid.endsWith("@g.us")) return;

  const messageId = msg.key?.id;
  if (!messageId) return;

  const actualMessage = unwrapMessage(msg.message);

  const rawText =
    actualMessage?.conversation ||
    actualMessage?.extendedTextMessage?.text ||
    actualMessage?.imageMessage?.caption ||
    "";

  const cleanText = String(rawText ?? "").trim();
  const senderPhone = getMessagePhone(msg);

  if (senderPhone && !allow(`global:${senderPhone}`, config.rateLimit.global.limit, config.rateLimit.global.windowMs)) {
    console.log(`Rate limited global: ${maskPhone(senderPhone)}`);
    return;
  }

  console.log("");
  console.log("=================================");
  console.log("PESAN MASUK");
  console.log("Nomor:", maskPhone(senderPhone));
  console.log("Pesan:", maskText(cleanText || "[MEDIA/GAMBAR]", 60));
  console.log("Message ID:", maskId(messageId));
  console.log("=================================");

  if (isHelpAddCommand(cleanText)) {
    await safeSendMessage(sock, senderJid, { text: getAddMemberHelp() });
    return;
  }

  if (cleanText.toLowerCase().startsWith("/add ")) {
    if (!allow(`add:${senderPhone}`, config.rateLimit.add.limit, config.rateLimit.add.windowMs)) {
      await safeSendMessage(sock, senderJid, { text: "Terlalu banyak permintaan. Coba lagi dalam 1 menit." });
      return;
    }

    if (!senderPhone || (!isAdminPhone(senderPhone) && !config.admin.phones.includes(senderPhone))) {
      console.log(`ADD DITOLAK: ${maskPhone(senderPhone)}`);
      await safeSendMessage(sock, senderJid, { text: "Anda tidak memiliki izin untuk menambahkan anggota." });
      return;
    }

    console.log(`COMMAND /ADD dari ${maskPhone(senderPhone)}`);

    try {
      const result = await addMember(cleanText, senderPhone);

      if (result?.success) {
        await safeSendMessage(sock, senderJid, {
          text:
            `ANGGOTA BERHASIL DITAMBAHKAN\n\n` +
            `Nama: ${result.name}\n` +
            `User ID: ${result.userId}\n` +
            `No WA: ${result.phone}\n` +
            `Hari Tagihan: ${result.hari || "-"}\n` +
            `Kelompok: ${result.kelompokId || "-"}\n\n` +
            `Pinjaman: ${rupiah(result.loanAmount)}\n` +
            `Pinjaman ID: ${result.pinjamanId}\n` +
            `Tenor: ${result.tenor} minggu\n` +
            `Angsuran: ${rupiah(result.installmentAmount)} / minggu\n\n` +
            `Jatuh tempo pertama: ${result.firstDueDate}\n` +
            `Jatuh tempo terakhir: ${result.lastDueDate}\n\n` +
            `Status: AKTIF`,
        });
      }
      return;
    } catch (error) {
      console.error("ERROR COMMAND /ADD:", error?.message || error);
      const safe = String(error?.message || "").includes("sudah terdaftar")
        ? error.message
        : "Gagal menambahkan anggota. Periksa format dan coba lagi.";
      await safeSendMessage(sock, senderJid, { text: safe });
      return;
    }
  }

  if (isHelpUpdateAngsuranCommand(cleanText)) {
    await safeSendMessage(sock, senderJid, { text: getUpdateAngsuranHelp() });
    return;
  }

  if (isUpdateAngsuranCommand(cleanText)) {
    if (!allow(`upd:${senderPhone}`, config.rateLimit.update.limit, config.rateLimit.update.windowMs)) {
      await safeSendMessage(sock, senderJid, { text: "Terlalu banyak permintaan update angsuran. Coba lagi nanti." });
      return;
    }

    if (!senderPhone || (!isAdminPhone(senderPhone) && !config.admin.phones.includes(senderPhone))) {
      await safeSendMessage(sock, senderJid, { text: "Anda tidak memiliki izin untuk update angsuran." });
      return;
    }

    try {
      console.log(`UPDATE ANGSURAN dari ${maskPhone(senderPhone)}`);
      const result = await updateAngsuran(cleanText, senderPhone);
      await safeSendMessage(sock, senderJid, {
        text: result?.message || (result?.success ? "Berhasil" : "Gagal update angsuran."),
      });
      return;
    } catch (error) {
      console.error("ERROR UPDATE ANGSURAN:", error?.message || error);
      await safeSendMessage(sock, senderJid, { text: "Gagal update angsuran. Periksa format dan coba lagi." });
      return;
    }
  }

  if (isLoanQuestion(cleanText)) {
    try {
      console.log("PERTANYAAN PINJAMAN:", cleanText);

      if (!senderPhone) {
        await safeSendMessage(sock, senderJid, { text: "Nomor WhatsApp tidak dapat dikenali." });
        return;
      }

      const result = await checkLoan(senderPhone);

      if (result?.error) {
        await safeSendMessage(sock, senderJid, { text: result.message });
        return;
      }

      if (!result?.found) {
        console.log("BUKAN ANGGOTA:", senderPhone);
        await safeSendMessage(sock, senderJid, {
          text: "Maaf, Anda bukan anggota koperasi.\n\nNomor WhatsApp Anda belum terdaftar sebagai anggota koperasi.",
        });
        return;
      }

      console.log(`ANGGOTA DITEMUKAN: ${maskId(result.userId)}`);
      await safeSendMessage(sock, senderJid, { text: result.message });
      return;
    } catch (error) {
      console.error("ERROR CEK PINJAMAN:", error?.message || error);
      await safeSendMessage(sock, senderJid, { text: "Maaf, data pinjaman tidak dapat diambil saat ini." });
      return;
    }
  }

  if (isMessageProcessed(messageId)) {
    console.log("MESSAGE SUDAH DIPROSES:", maskId(messageId));
    return;
  }

  const imageMessage = actualMessage?.imageMessage;
  if (!imageMessage) {
    return;
  }

  console.log("");
  console.log("===============================");
  console.log("GAMBAR DITERIMA");
  console.log("Message ID:", maskId(messageId));
  console.log("===============================");

  if (senderPhone && !allow(`img:${senderPhone}`, config.rateLimit.image.limit, config.rateLimit.image.windowMs)) {
    await safeSendMessage(sock, senderJid, { text: "Terlalu banyak gambar. Coba lagi dalam 1 menit." });
    return;
  }

  if (!senderPhone) {
    console.log("Nomor WhatsApp tidak ditemukan");
    return;
  }

  let member;
  try {
    member = await getMemberByPhone(senderPhone);
  } catch (sheetErr) {
    console.error("Gagal membaca Google Sheets (member):", sheetErr?.message || sheetErr);
    await safeSendMessage(sock, senderJid, { text: "Layanan database sedang sibuk. Silakan coba sesaat lagi." });
    return;
  }

  if (!member) {
    console.log("[SHEETS] anggota tidak ditemukan:", maskPhone(senderPhone));
    await safeSendMessage(sock, senderJid, {
      text: "Maaf, Anda bukan anggota koperasi.\n\nNomor WhatsApp Anda belum terdaftar sebagai anggota koperasi.",
    });
    return;
  }

  console.log("[SHEETS] Anggota ditemukan:", maskId(member["USER ID"]));

  const memberStatus = String(member["STATUS"] || "").trim().toUpperCase();

  if (memberStatus !== "AKTIF") {
    await safeSendMessage(sock, senderJid, { text: "Status keanggotaan Anda tidak aktif." });
    return;
  }

  console.log("Download gambar...");

  let buffer;
  try {
    buffer = await downloadMediaMessageSafe(msg);
  } catch (dlErr) {
    console.error("Gagal download gambar:", dlErr?.message || dlErr);
    await safeSendMessage(sock, senderJid, { text: "Gambar tidak dapat diunduh. Silakan kirim ulang bukti transfer." });
    return;
  }

  if (!buffer || !Buffer.isBuffer(buffer)) {
    console.log("Gagal download gambar");
    await safeSendMessage(sock, senderJid, { text: "Gambar tidak dapat dibaca. Silakan kirim ulang bukti transfer." });
    return;
  }

  if (buffer.length > GEMINI_MAX_BYTES) {
    console.log(`Gambar terlalu besar: ${buffer.length} bytes`);
    await safeSendMessage(sock, senderJid, { text: "Gambar terlalu besar (maks 8MB). Kompres dan kirim ulang." });
    return;
  }

  if (isImageProcessed(buffer)) {
    console.log("GAMBAR DUPLIKAT");
    await safeSendMessage(sock, senderJid, {
      text:
        "Bukti transfer ini sudah pernah diproses.\n\n" +
        "Jika Anda yakin ini adalah bukti transfer baru, silakan kirim ulang dengan gambar yang berbeda.",
    });
    return;
  }

  console.log("Analisis transfer...");

  let transfer;
  try {
    transfer = await analyzeTransferImage(buffer, imageMessage.mimetype);
    console.log("Hasil Gemini:", transfer);
  } catch (aiErr) {
    console.error("Gagal analisis Gemini:", aiErr?.message || aiErr);
    await safeSendMessage(sock, senderJid, { text: "Gagal menganalisis bukti transfer via AI. Pastikan foto jelas dan coba lagi." });
    return;
  }

  if (!transfer || transfer.is_transfer_proof !== true) {
    console.log("Gemini menyatakan bukan bukti transfer");
    await safeSendMessage(sock, senderJid, { text: "Gambar tidak terdeteksi sebagai bukti transfer yang sah." });
    return;
  }

  const amount = Number(String(transfer.amount || "").replace(/\D/g, ""));

  if (!amount || amount <= 0) {
    console.log("Nominal transfer tidak valid:", transfer.amount);
    await safeSendMessage(sock, senderJid, { text: "Nominal transfer tidak dapat dibaca." });
    return;
  }

  console.log("Nominal:", rupiah(amount));

  if (!transfer.date) {
    console.log("Tanggal transfer tidak ditemukan");
    await safeSendMessage(sock, senderJid, { text: "Tanggal transfer tidak dapat dibaca." });
    return;
  }

  let loan;
  let installment;

  try {
    loan = await getActiveLoan(member["USER ID"]);

    if (!loan) {
      console.log("Tidak ada pinjaman aktif");
      await safeSendMessage(sock, senderJid, { text: "Tidak ditemukan pinjaman aktif." });
      return;
    }

    console.log("Pinjaman:", loan["PINJAMAN ID"]);

    installment = await getNextInstallment(member["USER ID"], loan["PINJAMAN ID"]);

    if (!installment) {
      await safeSendMessage(sock, senderJid, { text: "Semua angsuran Anda sudah lunas." });
      return;
    }

    console.log("Angsuran:", installment["MINGGU"]);
    console.log("Tagihan:", rupiah(installment["TAGIHAN"]));
  } catch (dbErr) {
    console.error("Gagal membaca data pinjaman/angsuran:", dbErr?.message || dbErr);
    await safeSendMessage(sock, senderJid, { text: "Gagal membaca data pinjaman dari Google Sheets." });
    return;
  }

  const payment = {
    user_id: member["USER ID"],
    loan_id: loan["PINJAMAN ID"],
    amount: amount,
    transfer_date: transfer.date,
  };

  console.log("Nominal transfer:", rupiah(amount));
  console.log("Tanggal transfer:", transfer.date);

  let result;
  try {
    result = await processPayment(payment, loan, installment);
  } catch (payErr) {
    console.error("Error processPayment:", payErr?.message || payErr);
    await safeSendMessage(sock, senderJid, { text: "Gagal memproses data pembayaran." });
    return;
  }

  console.log("Hasil pembayaran:", result);

  if (result?.success === true) {
    markProcessed(messageId, buffer);

    console.log("PEMBAYARAN BERHASIL");

    await safeSendMessage(sock, senderJid, {
      text:
        `PEMBAYARAN BERHASIL\n\n` +
        `Nama: ${member["NAMA"]}\n` +
        `Nominal: ${rupiah(amount)}\n` +
        `Tanggal: ${transfer.date}\n` +
        `Jam: ${transfer.time || "-"}\n` +
        `Angsuran: Minggu ke-${installment["MINGGU"]}\n` +
        `Bank: ${transfer.bank || "-"}\n` +
        `Referensi: ${transfer.reference || "-"}\n\n` +
        `Status: SUDAH DIBAYAR`,
    });

    return;
  }

  console.log("PEMBAYARAN GAGAL:", result?.status);
  await safeSendMessage(sock, senderJid, { text: result?.message || "Pembayaran tidak berhasil diproses." });
}