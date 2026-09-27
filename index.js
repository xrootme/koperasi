import dotenv from "dotenv";
dotenv.config();

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";

import pino from "pino";
import qrcode from "qrcode-terminal";

import {
  getMemberByPhone,
  getActiveLoan,
  getNextInstallment,
} from "./database/database.js";

import { processPayment } from "./service/paymentProcessor.js";
import { analyzeTransferImage } from "./ai/gemini.js";
import { getMessagePhone } from "./utils/phone.js";
import { rupiah } from "./utils/rupiah.js";
import { addMember } from "./commands/addMember.js";
import { isHelpAddCommand, getAddMemberHelp } from "./commands/helperMember.js";

import { isLoanQuestion, checkLoan } from "./commands/checkLoan.js";
import { isUpdateAngsuranCommand, updateAngsuran, isHelpUpdateAngsuranCommand, getUpdateAngsuranHelp } from "./commands/updateAngsuran.js";

import {
  isMessageProcessed,
  isImageProcessed,
  markProcessed,
} from "./utils/processedMessages.js";

import { isAdminPhone } from "./src/utils/adminAuth.js";
import { allow } from "./src/utils/rateLimiter.js";
import { maskPhone, maskId, maskText } from "./src/utils/logger.js";

const ADMIN_PHONES = (process.env.ADMIN_PHONES || "").split(",").map((s) => s.trim()).filter(Boolean);
const GEMINI_MAX_BYTES = 8 * 1024 * 1024;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth/baileys");

  const sock = makeWASocket({
    auth: state,
    logger: pino({
      level: "silent",
    }),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📱 Silakan scan QR WhatsApp...");

      qrcode.generate(qr, {
        small: true,
      });
    }

    if (connection === "open") {
      console.log("=================================");
      console.log("✅ WHATSAPP BERHASIL TERHUBUNG");
      console.log("=================================");
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;

      console.log("❌ WHATSAPP TERPUTUS. CODE:", code);

      if (code === DisconnectReason.connectionReplaced) {
        console.log("⚠️ SESSION WHATSAPP DIGANTIKAN.");

        console.log("⚠️ Tidak melakukan reconnect otomatis.");

        return;
      }

      console.log("🔄 Reconnect dalam 5 detik...");

      setTimeout(() => {
        startBot();
      }, 5000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages?.[0];

      if (!msg) return;

      if (msg.key.remoteJid?.endsWith("@g.us")) {
        return;
      }

      if (msg.key.fromMe) {
        return;
      }

      const messageId = msg.key?.id;

      if (!messageId) {
        return;
      }

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";

      const cleanText = text.trim();

      const senderPhone = getMessagePhone(msg);

      if (senderPhone && !allow(`global:${senderPhone}`, 30, 60_000)) {
        console.log(`⏳ Rate limited global: ${maskPhone(senderPhone)}`);
        return;
      }

      console.log("");
      console.log("=================================");
      console.log("📩 PESAN MASUK");
      console.log("📱 Nomor:", maskPhone(senderPhone));
      console.log("💬 Pesan:", maskText(cleanText || "[GAMBAR]", 60));
      console.log("🆔 Message ID:", maskId(messageId));
      console.log("=================================");

      // ==================================
      // HELPER /ADD
      // ==================================

      if (isHelpAddCommand(cleanText)) {
        await sock.sendMessage(msg.key.remoteJid, {
          text: getAddMemberHelp(),
        });

        return;
      }

      // ==================================
      // COMMAND /ADD
      // ==================================

      if (cleanText.toLowerCase().startsWith("/add ")) {
        if (!allow(`add:${senderPhone}`, 5, 60_000)) {
          await sock.sendMessage(msg.key.remoteJid, {
            text: "⏳ Terlalu banyak permintaan. Coba lagi dalam 1 menit.",
          });
          return;
        }

        if (!senderPhone || (!isAdminPhone(senderPhone) && !ADMIN_PHONES.includes(senderPhone))) {
          console.log(`🚫 /ADD DITOLAK: ${maskPhone(senderPhone)}`);
          await sock.sendMessage(msg.key.remoteJid, {
            text: "❌ Anda tidak memiliki izin untuk menambahkan anggota.",
          });
          return;
        }

        console.log(`🟢 COMMAND /ADD dari ${maskPhone(senderPhone)}`);

        try {
          const result = await addMember(cleanText, senderPhone);

          if (result?.success) {
            await sock.sendMessage(msg.key.remoteJid, {
              text:
                `✅ ANGGOTA BERHASIL DITAMBAHKAN\n\n` +
                `👤 Nama: ${result.name}\n` +
                `🆔 User ID: ${result.userId}\n` +
                `📱 No WA: ${result.phone}\n` +
                `📅 Hari Tagihan: ${result.hari || "-"}\n` +
                `👥 Kelompok: ${result.kelompokId || "-"}\n\n` +
                `💰 Pinjaman: ${rupiah(result.loanAmount)}\n` +
                `💳 Pinjaman ID: ${result.pinjamanId}\n` +
                `📆 Tenor: ${result.tenor} minggu\n` +
                `💵 Angsuran: ${rupiah(result.installmentAmount)} / minggu\n\n` +
                `📅 Jatuh tempo pertama: ${result.firstDueDate}\n` +
                `📅 Jatuh tempo terakhir: ${result.lastDueDate}\n\n` +
                `Status: AKTIF`,
            });
          }

          return;
        } catch (error) {
          console.error("❌ ERROR COMMAND /ADD:", error?.message || error);
          const safe = String(error?.message || "").includes("sudah terdaftar")
            ? error.message
            : "Gagal menambahkan anggota. Periksa format dan coba lagi.";
          await sock.sendMessage(msg.key.remoteJid, { text: `❌ ${safe}` });
          return;
        }
      }

      if (isHelpUpdateAngsuranCommand(cleanText)) {
        await sock.sendMessage(msg.key.remoteJid, { text: getUpdateAngsuranHelp() });
        return;
      }

      // ==================================
      // UPDATE ANGSURAN (ADMIN)
      // ==================================

      if (isUpdateAngsuranCommand(cleanText)) {
        if (!allow(`upd:${senderPhone}`, 10, 60_000)) {
          await sock.sendMessage(msg.key.remoteJid, {
            text: "⏳ Terlalu banyak permintaan update angsuran. Coba lagi nanti.",
          });
          return;
        }

        if (!senderPhone || (!isAdminPhone(senderPhone) && !ADMIN_PHONES.includes(senderPhone))) {
          await sock.sendMessage(msg.key.remoteJid, {
            text: "❌ Anda tidak memiliki izin untuk update angsuran.",
          });
          return;
        }

        try {
          console.log(`🟢 UPDATE ANGSURAN dari ${maskPhone(senderPhone)}`);
          const result = await updateAngsuran(cleanText, senderPhone);
          await sock.sendMessage(msg.key.remoteJid, {
            text: result?.message || (result?.success ? "✅ Berhasil" : "❌ Gagal update angsuran."),
          });
          return;
        } catch (error) {
          console.error("❌ ERROR UPDATE ANGSURAN:", error?.message || error);
          await sock.sendMessage(msg.key.remoteJid, {
            text: "❌ Gagal update angsuran. Periksa format dan coba lagi.",
          });
          return;
        }
      }

      // ==================================
      // CEK PINJAMAN
      // ==================================

      if (isLoanQuestion(cleanText)) {
        try {
          console.log("🔎 PERTANYAAN PINJAMAN:", cleanText);

          if (!senderPhone) {
            await sock.sendMessage(msg.key.remoteJid, {
              text: "❌ Nomor WhatsApp tidak dapat dikenali.",
            });

            return;
          }

          const result = await checkLoan(senderPhone);

          if (!result?.found) {
            console.log("❌ BUKAN ANGGOTA:", senderPhone);

            await sock.sendMessage(msg.key.remoteJid, {
              text:
                "❌ Maaf, Anda bukan anggota koperasi.\n\n" +
                "Nomor WhatsApp Anda belum terdaftar sebagai anggota koperasi.",
            });

            return;
          }

          console.log(`✅ ANGGOTA DITEMUKAN: ${maskId(result.userId)}`);

          await sock.sendMessage(msg.key.remoteJid, {
            text: result.message,
          });

          return;
        } catch (error) {
          console.error("❌ ERROR CEK PINJAMAN:", error?.message || error);

          await sock.sendMessage(msg.key.remoteJid, {
            text: "❌ Maaf, data pinjaman tidak dapat diambil saat ini.",
          });

          return;
        }
      }

      // ==================================
      // DUPLICATE MESSAGE
      // ==================================

      if (isMessageProcessed(messageId)) {
        console.log("🚫 MESSAGE SUDAH DIPROSES:", maskId(messageId));
        return;
      }

      // ==================================
      // CHECK IMAGE
      // ==================================

      const imageMessage = msg.message?.imageMessage;

      if (!imageMessage) {
        return;
      }

      console.log("");
      console.log("===============================");
      console.log("📸 GAMBAR DITERIMA");
      console.log("Message ID:", maskId(messageId));
      console.log("===============================");

      if (senderPhone && !allow(`img:${senderPhone}`, 5, 60_000)) {
        await sock.sendMessage(msg.key.remoteJid, {
          text: "⏳ Terlalu banyak gambar. Coba lagi dalam 1 menit.",
        });
        return;
      }

      // ==================================
      // MEMBER
      // ==================================

      if (!senderPhone) {
        console.log("❌ Nomor WhatsApp tidak ditemukan");

        return;
      }

      const member = await getMemberByPhone(senderPhone);

      if (!member) {
        console.log("[SHEETS] anggota tidak ditemukan:", maskPhone(senderPhone));

        await sock.sendMessage(msg.key.remoteJid, {
          text:
            "❌ Maaf, Anda bukan anggota koperasi.\n\n" +
            "Nomor WhatsApp Anda belum terdaftar sebagai anggota koperasi.",
        });

        return;
      }

      console.log("[SHEETS] Anggota ditemukan:", maskId(member["USER ID"]));

      // ==================================
      // STATUS ANGGOTA
      // ==================================

      const memberStatus = String(member["STATUS"] || "")
        .trim()
        .toUpperCase();

      if (memberStatus !== "AKTIF") {
        await sock.sendMessage(msg.key.remoteJid, {
          text: "❌ Status keanggotaan Anda tidak aktif.",
        });

        return;
      }

      // ==================================
      // DOWNLOAD GAMBAR
      // ==================================

      console.log("⬇️ Download gambar...");

      const buffer = await downloadMediaMessage(
        msg,
        "buffer",
        {},
        {
          logger: pino({
            level: "silent",
          }),
        },
      );

      if (!buffer || !Buffer.isBuffer(buffer)) {
        console.log("❌ Gagal download gambar");

        await sock.sendMessage(msg.key.remoteJid, {
          text: "❌ Gambar tidak dapat dibaca. Silakan kirim ulang bukti transfer.",
        });

        return;
      }

      if (buffer.length > GEMINI_MAX_BYTES) {
        console.log(`❌ Gambar terlalu besar: ${buffer.length} bytes`);

        await sock.sendMessage(msg.key.remoteJid, {
          text: "❌ Gambar terlalu besar (maks 8MB). Kompres dan kirim ulang.",
        });

        return;
      }

      // ==================================
      // DUPLIKAT GAMBAR
      // ==================================

      if (isImageProcessed(buffer)) {
        console.log("🚫 GAMBAR DUPLIKAT");

        await sock.sendMessage(msg.key.remoteJid, {
          text:
            "⚠️ Bukti transfer ini sudah pernah diproses.\n\n" +
            "Jika Anda yakin ini adalah bukti transfer baru, silakan kirim ulang dengan gambar yang berbeda.",
        });

        return;
      }

      // ==================================
      // GEMINI
      // ==================================

      console.log("🤖 Analisis transfer...");

      const transfer = await analyzeTransferImage(buffer);

      console.log("🤖 Hasil Gemini:", transfer);

      // ==================================
      // VALIDASI TRANSFER
      // ==================================

      if (!transfer || transfer.is_transfer_proof !== true) {
        console.log("❌ Gemini menyatakan bukan bukti transfer");

        await sock.sendMessage(msg.key.remoteJid, {
          text: "❌ Bukti transfer tidak dapat diverifikasi.",
        });

        return;
      }

      // ==================================
      // NOMINAL
      // ==================================

      const amount = Number(String(transfer.amount || "").replace(/\D/g, ""));

      if (!amount || amount <= 0) {
        console.log("❌ Nominal transfer tidak valid:", transfer.amount);

        await sock.sendMessage(msg.key.remoteJid, {
          text: "❌ Nominal transfer tidak dapat dibaca.",
        });

        return;
      }

      console.log("💰 Nominal:", rupiah(amount));

      // ==================================
      // TANGGAL
      // ==================================

      if (!transfer.date) {
        console.log("❌ Tanggal transfer tidak ditemukan");

        await sock.sendMessage(msg.key.remoteJid, {
          text: "❌ Tanggal transfer tidak dapat dibaca.",
        });

        return;
      }

      // ==================================
      // PINJAMAN AKTIF
      // ==================================

      const loan = await getActiveLoan(member["USER ID"]);

      if (!loan) {
        console.log("❌ Tidak ada pinjaman aktif");

        await sock.sendMessage(msg.key.remoteJid, {
          text: "❌ Tidak ditemukan pinjaman aktif.",
        });

        return;
      }

      console.log("💳 Pinjaman:", loan["PINJAMAN ID"]);

      // ==================================
      // ANGSURAN BERIKUTNYA
      // ==================================

      const installment = await getNextInstallment(
        member["USER ID"],
        loan["PINJAMAN ID"],
      );

      if (!installment) {
        await sock.sendMessage(msg.key.remoteJid, {
          text: "✅ Semua angsuran Anda sudah lunas.",
        });

        return;
      }

      console.log("📋 Angsuran:", installment["MINGGU"]);

      console.log("💰 Tagihan:", rupiah(installment["TAGIHAN"]));

      // ==================================
      // PAYMENT
      // ==================================

      const payment = {
        user_id: member["USER ID"],

        loan_id: loan["PINJAMAN ID"],

        amount: amount,

        transfer_date: transfer.date,
      };

      console.log("💰 Nominal transfer:", rupiah(amount));

      console.log("📅 Tanggal transfer:", transfer.date);

      // ==================================
      // PROCESS PAYMENT
      // ==================================

      const result = await processPayment(payment, loan, installment);

      console.log("📊 Hasil pembayaran:", result);

      // ==================================
      // BERHASIL
      // ==================================

      if (result?.success === true) {
        markProcessed(messageId, buffer);

        console.log("✅ PEMBAYARAN BERHASIL");

        await sock.sendMessage(msg.key.remoteJid, {
          text:
            `✅ PEMBAYARAN BERHASIL\n\n` +
            `👤 Nama: ${member["NAMA"]}\n` +
            `💰 Nominal: ${rupiah(amount)}\n` +
            `📅 Tanggal: ${transfer.date}\n` +
            `⏰ Jam: ${transfer.time || "-"}\n` +
            `📋 Angsuran: Minggu ${installment["MINGGU"]}\n` +
            `🏦 Bank: ${transfer.bank || "-"}\n` +
            `🔖 Referensi: ${transfer.reference || "-"}\n\n` +
            `Status: SUDAH DIBAYAR`,
        });

        return;
      }

      // ==================================
      // PAYMENT GAGAL
      // ==================================

      console.log("❌ PEMBAYARAN GAGAL");

      await sock.sendMessage(msg.key.remoteJid, {
        text: result?.message || "❌ Pembayaran tidak berhasil diproses.",
      });
    } catch (error) {
      console.error("❌ ERROR PROCESS:", error);

      try {
        if (msg?.key?.remoteJid) {
          await sock.sendMessage(msg.key.remoteJid, {
            text: "❌ Terjadi kesalahan saat memproses pesan.",
          });
        }
      } catch {
        // Abaikan error pengiriman
      }
    }
  });
}

startBot().catch((error) => {
  console.error("❌ BOT GAGAL START:", error);
});
