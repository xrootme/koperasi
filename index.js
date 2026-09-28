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
} from "./src/database/index.js";

import { processPayment } from "./src/services/paymentProcessor.js";
import { analyzeTransferImage } from "./src/ai/gemini.js";
import { getMessagePhone } from "./src/utils/phone.js";
import { rupiah } from "./src/utils/rupiah.js";
import {
  addMember,
  isHelpAddCommand,
  getAddMemberHelp,
  checkLoan,
  isLoanQuestion,
  updateAngsuran,
  isUpdateAngsuranCommand,
  isHelpUpdateAngsuranCommand,
  getUpdateAngsuranHelp,
} from "./src/commands/index.js";

import {
  isMessageProcessed,
  isImageProcessed,
  markProcessed,
} from "./src/utils/processedMessages.js";

import { isAdminPhone } from "./src/utils/adminAuth.js";
import { allow } from "./src/utils/rateLimiter.js";
import { maskPhone, maskId, maskText } from "./src/utils/logger.js";

// ==========================================
// GLOBAL ERROR HANDLERS (ANTI-CRASH)
// ==========================================

process.on("uncaughtException", (error) => {
  console.error("💥 [UNCAUGHT EXCEPTION]:", error?.stack || error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 [UNHANDLED REJECTION]:", reason);
});

// ==========================================
// CONFIGURATION
// ==========================================

const ADMIN_PHONES = (process.env.ADMIN_PHONES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const GEMINI_MAX_BYTES = 8 * 1024 * 1024;

let currentSock = null;
let isReconnecting = false;
let reconnectTimer = null;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function unwrapMessage(rawMsg) {
  if (!rawMsg) return {};
  let m = rawMsg;
  while (
    m &&
    (m.ephemeralMessage ||
      m.viewOnceMessage ||
      m.viewOnceMessageV2 ||
      m.documentWithCaptionMessage)
  ) {
    m =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.documentWithCaptionMessage?.message ||
      m;
  }
  return m || {};
}

async function safeSendMessage(sock, jid, content) {
  if (!sock || !jid) return null;
  try {
    return await sock.sendMessage(jid, content);
  } catch (err) {
    console.error(`❌ Gagal kirim pesan ke ${jid}:`, err?.message || err);
    return null;
  }
}

async function cleanupOldSocket(sock) {
  if (!sock) return;
  try {
    sock.ev?.removeAllListeners();
    sock.ws?.close();
  } catch {
    // Abaikan error cleanup
  }
}

// ==========================================
// MAIN BOT
// ==========================================

async function startBot() {
  if (currentSock) {
    await cleanupOldSocket(currentSock);
    currentSock = null;
  }

  const { state, saveCreds } = await useMultiFileAuthState("./auth/baileys");

  const sock = makeWASocket({
    auth: state,
    logger: pino({
      level: "silent",
    }),
  });

  currentSock = sock;

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
      const errorMsg = lastDisconnect?.error?.message || "Unknown error";

      console.log(`❌ WHATSAPP TERPUTUS (Code: ${code || "none"}, Error: ${errorMsg})`);

      if (code === DisconnectReason.loggedOut) {
        console.log("⚠️ PERANGKAT TELAH LOGOUT (401). Silakan hapus folder auth/baileys dan scan QR ulang.");
        return;
      }

      if (code === DisconnectReason.connectionReplaced) {
        console.log("⚠️ SESSION WHATSAPP DIGANTIKAN DI TEMPAT LAIN. Bot dihentikan agar tidak terjadi konflik.");
        return;
      }

      if (isReconnecting) return;
      isReconnecting = true;

      console.log("🔄 Reconnect dalam 5 detik...");
      if (reconnectTimer) clearTimeout(reconnectTimer);

      reconnectTimer = setTimeout(async () => {
        isReconnecting = false;
        try {
          await startBot();
        } catch (err) {
          console.error("❌ Gagal reconnect:", err?.message || err);
          setTimeout(() => {
            startBot().catch((e) => console.error("❌ Gagal retry reconnect:", e?.message || e));
          }, 10_000);
        }
      }, 5000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    let msg = null;
    let senderJid = null;

    try {
      msg = messages?.[0];
      if (!msg) return;

      senderJid = msg.key?.remoteJid;
      if (!senderJid) return;

      if (senderJid.endsWith("@g.us")) {
        return; // Abaikan pesan grup
      }

      if (msg.key?.fromMe) {
        return; // Abaikan pesan bot sendiri
      }

      const messageId = msg.key?.id;
      if (!messageId) {
        return;
      }

      const actualMessage = unwrapMessage(msg.message);

      const text =
        actualMessage?.conversation ||
        actualMessage?.extendedTextMessage?.text ||
        actualMessage?.imageMessage?.caption ||
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
      console.log("💬 Pesan:", maskText(cleanText || "[MEDIA/GAMBAR]", 60));
      console.log("🆔 Message ID:", maskId(messageId));
      console.log("=================================");

      // ==================================
      // 1. HELPER /ADD
      // ==================================
      if (isHelpAddCommand(cleanText)) {
        await safeSendMessage(sock, senderJid, {
          text: getAddMemberHelp(),
        });
        return;
      }

      // ==================================
      // 2. COMMAND /ADD
      // ==================================
      if (cleanText.toLowerCase().startsWith("/add ")) {
        if (!allow(`add:${senderPhone}`, 5, 60_000)) {
          await safeSendMessage(sock, senderJid, {
            text: "⏳ Terlalu banyak permintaan. Coba lagi dalam 1 menit.",
          });
          return;
        }

        if (!senderPhone || (!isAdminPhone(senderPhone) && !ADMIN_PHONES.includes(senderPhone))) {
          console.log(`🚫 /ADD DITOLAK: ${maskPhone(senderPhone)}`);
          await safeSendMessage(sock, senderJid, {
            text: "❌ Anda tidak memiliki izin untuk menambahkan anggota.",
          });
          return;
        }

        console.log(`🟢 COMMAND /ADD dari ${maskPhone(senderPhone)}`);

        try {
          const result = await addMember(cleanText, senderPhone);

          if (result?.success) {
            await safeSendMessage(sock, senderJid, {
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
          await safeSendMessage(sock, senderJid, { text: `❌ ${safe}` });
          return;
        }
      }

      // ==================================
      // 3. HELPER /UPDATE-ANGSURAN
      // ==================================
      if (isHelpUpdateAngsuranCommand(cleanText)) {
        await safeSendMessage(sock, senderJid, { text: getUpdateAngsuranHelp() });
        return;
      }

      // ==================================
      // 4. UPDATE ANGSURAN (ADMIN)
      // ==================================
      if (isUpdateAngsuranCommand(cleanText)) {
        if (!allow(`upd:${senderPhone}`, 10, 60_000)) {
          await safeSendMessage(sock, senderJid, {
            text: "⏳ Terlalu banyak permintaan update angsuran. Coba lagi nanti.",
          });
          return;
        }

        if (!senderPhone || (!isAdminPhone(senderPhone) && !ADMIN_PHONES.includes(senderPhone))) {
          await safeSendMessage(sock, senderJid, {
            text: "❌ Anda tidak memiliki izin untuk update angsuran.",
          });
          return;
        }

        try {
          console.log(`🟢 UPDATE ANGSURAN dari ${maskPhone(senderPhone)}`);
          const result = await updateAngsuran(cleanText, senderPhone);
          await safeSendMessage(sock, senderJid, {
            text: result?.message || (result?.success ? "✅ Berhasil" : "❌ Gagal update angsuran."),
          });
          return;
        } catch (error) {
          console.error("❌ ERROR UPDATE ANGSURAN:", error?.message || error);
          await safeSendMessage(sock, senderJid, {
            text: "❌ Gagal update angsuran. Periksa format dan coba lagi.",
          });
          return;
        }
      }

      // ==================================
      // 5. CEK PINJAMAN
      // ==================================
      if (isLoanQuestion(cleanText)) {
        try {
          console.log("🔎 PERTANYAAN PINJAMAN:", cleanText);

          if (!senderPhone) {
            await safeSendMessage(sock, senderJid, {
              text: "❌ Nomor WhatsApp tidak dapat dikenali.",
            });
            return;
          }

          const result = await checkLoan(senderPhone);

          if (!result?.found) {
            console.log("❌ BUKAN ANGGOTA:", senderPhone);
            await safeSendMessage(sock, senderJid, {
              text:
                "❌ Maaf, Anda bukan anggota koperasi.\n\n" +
                "Nomor WhatsApp Anda belum terdaftar sebagai anggota koperasi.",
            });
            return;
          }

          console.log(`✅ ANGGOTA DITEMUKAN: ${maskId(result.userId)}`);
          await safeSendMessage(sock, senderJid, {
            text: result.message,
          });
          return;
        } catch (error) {
          console.error("❌ ERROR CEK PINJAMAN:", error?.message || error);
          await safeSendMessage(sock, senderJid, {
            text: "❌ Maaf, data pinjaman tidak dapat diambil saat ini.",
          });
          return;
        }
      }

      // ==================================
      // 6. DUPLICATE MESSAGE
      // ==================================
      if (isMessageProcessed(messageId)) {
        console.log("🚫 MESSAGE SUDAH DIPROSES:", maskId(messageId));
        return;
      }

      // ==================================
      // 7. CHECK IMAGE MESSAGE
      // ==================================
      const imageMessage = actualMessage?.imageMessage;
      if (!imageMessage) {
        return;
      }

      console.log("");
      console.log("===============================");
      console.log("📸 GAMBAR DITERIMA");
      console.log("Message ID:", maskId(messageId));
      console.log("===============================");

      if (senderPhone && !allow(`img:${senderPhone}`, 5, 60_000)) {
        await safeSendMessage(sock, senderJid, {
          text: "⏳ Terlalu banyak gambar. Coba lagi dalam 1 menit.",
        });
        return;
      }

      // ==================================
      // 8. CHECK MEMBER
      // ==================================
      if (!senderPhone) {
        console.log("❌ Nomor WhatsApp tidak ditemukan");
        return;
      }

      let member;
      try {
        member = await getMemberByPhone(senderPhone);
      } catch (sheetErr) {
        console.error("❌ Gagal membaca Google Sheets (member):", sheetErr?.message || sheetErr);
        await safeSendMessage(sock, senderJid, {
          text: "❌ Layanan database sedang sibuk. Silakan coba sesaat lagi.",
        });
        return;
      }

      if (!member) {
        console.log("[SHEETS] anggota tidak ditemukan:", maskPhone(senderPhone));
        await safeSendMessage(sock, senderJid, {
          text:
            "❌ Maaf, Anda bukan anggota koperasi.\n\n" +
            "Nomor WhatsApp Anda belum terdaftar sebagai anggota koperasi.",
        });
        return;
      }

      console.log("[SHEETS] Anggota ditemukan:", maskId(member["USER ID"]));

      const memberStatus = String(member["STATUS"] || "")
        .trim()
        .toUpperCase();

      if (memberStatus !== "AKTIF") {
        await safeSendMessage(sock, senderJid, {
          text: "❌ Status keanggotaan Anda tidak aktif.",
        });
        return;
      }

      // ==================================
      // 9. DOWNLOAD GAMBAR
      // ==================================
      console.log("⬇️ Download gambar...");

      let buffer;
      try {
        buffer = await downloadMediaMessage(
          msg,
          "buffer",
          {},
          {
            logger: pino({
              level: "silent",
            }),
          },
        );
      } catch (dlErr) {
        console.error("❌ Gagal download gambar:", dlErr?.message || dlErr);
        await safeSendMessage(sock, senderJid, {
          text: "❌ Gambar tidak dapat diunduh. Silakan kirim ulang bukti transfer.",
        });
        return;
      }

      if (!buffer || !Buffer.isBuffer(buffer)) {
        console.log("❌ Gagal download gambar");
        await safeSendMessage(sock, senderJid, {
          text: "❌ Gambar tidak dapat dibaca. Silakan kirim ulang bukti transfer.",
        });
        return;
      }

      if (buffer.length > GEMINI_MAX_BYTES) {
        console.log(`❌ Gambar terlalu besar: ${buffer.length} bytes`);
        await safeSendMessage(sock, senderJid, {
          text: "❌ Gambar terlalu besar (maks 8MB). Kompres dan kirim ulang.",
        });
        return;
      }

      // ==================================
      // 10. DUPLIKAT GAMBAR
      // ==================================
      if (isImageProcessed(buffer)) {
        console.log("🚫 GAMBAR DUPLIKAT");
        await safeSendMessage(sock, senderJid, {
          text:
            "⚠️ Bukti transfer ini sudah pernah diproses.\n\n" +
            "Jika Anda yakin ini adalah bukti transfer baru, silakan kirim ulang dengan gambar yang berbeda.",
        });
        return;
      }

      // ==================================
      // 11. GEMINI
      // ==================================
      console.log("🤖 Analisis transfer...");

      let transfer;
      try {
        transfer = await analyzeTransferImage(buffer, imageMessage.mimetype);
        console.log("🤖 Hasil Gemini:", transfer);
      } catch (aiErr) {
        console.error("❌ Gagal analisis Gemini:", aiErr?.message || aiErr);
        await safeSendMessage(sock, senderJid, {
          text: "❌ Gagal menganalisis bukti transfer via AI. Pastikan foto jelas dan coba lagi.",
        });
        return;
      }

      // ==================================
      // 12. VALIDASI TRANSFER
      // ==================================
      if (!transfer || transfer.is_transfer_proof !== true) {
        console.log("❌ Gemini menyatakan bukan bukti transfer");
        await safeSendMessage(sock, senderJid, {
          text: "❌ Gambar tidak terdeteksi sebagai bukti transfer yang sah.",
        });
        return;
      }

      // ==================================
      // 13. NOMINAL & TANGGAL
      // ==================================
      const amount = Number(String(transfer.amount || "").replace(/\D/g, ""));

      if (!amount || amount <= 0) {
        console.log("❌ Nominal transfer tidak valid:", transfer.amount);
        await safeSendMessage(sock, senderJid, {
          text: "❌ Nominal transfer tidak dapat dibaca.",
        });
        return;
      }

      console.log("💰 Nominal:", rupiah(amount));

      if (!transfer.date) {
        console.log("❌ Tanggal transfer tidak ditemukan");
        await safeSendMessage(sock, senderJid, {
          text: "❌ Tanggal transfer tidak dapat dibaca.",
        });
        return;
      }

      // ==================================
      // 14. PINJAMAN AKTIF & ANGSURAN
      // ==================================
      let loan;
      let installment;

      try {
        loan = await getActiveLoan(member["USER ID"]);

        if (!loan) {
          console.log("❌ Tidak ada pinjaman aktif");
          await safeSendMessage(sock, senderJid, {
            text: "❌ Tidak ditemukan pinjaman aktif.",
          });
          return;
        }

        console.log("💳 Pinjaman:", loan["PINJAMAN ID"]);

        installment = await getNextInstallment(
          member["USER ID"],
          loan["PINJAMAN ID"],
        );

        if (!installment) {
          await safeSendMessage(sock, senderJid, {
            text: "✅ Semua angsuran Anda sudah lunas.",
          });
          return;
        }

        console.log("📋 Angsuran:", installment["MINGGU"]);
        console.log("💰 Tagihan:", rupiah(installment["TAGIHAN"]));
      } catch (dbErr) {
        console.error("❌ Gagal membaca data pinjaman/angsuran:", dbErr?.message || dbErr);
        await safeSendMessage(sock, senderJid, {
          text: "❌ Gagal membaca data pinjaman dari Google Sheets.",
        });
        return;
      }

      // ==================================
      // 15. PROSES PEMBAYARAN
      // ==================================
      const payment = {
        user_id: member["USER ID"],
        loan_id: loan["PINJAMAN ID"],
        amount: amount,
        transfer_date: transfer.date,
      };

      console.log("💰 Nominal transfer:", rupiah(amount));
      console.log("📅 Tanggal transfer:", transfer.date);

      let result;
      try {
        result = await processPayment(payment, loan, installment);
      } catch (payErr) {
        console.error("❌ Error processPayment:", payErr?.message || payErr);
        await safeSendMessage(sock, senderJid, {
          text: "❌ Gagal memproses data pembayaran.",
        });
        return;
      }

      console.log("📊 Hasil pembayaran:", result);

      if (result?.success === true) {
        markProcessed(messageId, buffer);

        console.log("✅ PEMBAYARAN BERHASIL");

        await safeSendMessage(sock, senderJid, {
          text:
            `✅ PEMBAYARAN BERHASIL\n\n` +
            `👤 Nama: ${member["NAMA"]}\n` +
            `💰 Nominal: ${rupiah(amount)}\n` +
            `📅 Tanggal: ${transfer.date}\n` +
            `⏰ Jam: ${transfer.time || "-"}\n` +
            `📋 Angsuran: Minggu ke-${installment["MINGGU"]}\n` +
            `🏦 Bank: ${transfer.bank || "-"}\n` +
            `🔖 Referensi: ${transfer.reference || "-"}\n\n` +
            `Status: SUDAH DIBAYAR`,
        });

        return;
      }

      // PAYMENT GAGAL
      console.log("❌ PEMBAYARAN GAGAL:", result?.status);
      await safeSendMessage(sock, senderJid, {
        text: result?.message || "❌ Pembayaran tidak berhasil diproses.",
      });
    } catch (error) {
      console.error("❌ ERROR PROCESS:", error?.message || error);
      if (senderJid) {
        await safeSendMessage(sock, senderJid, {
          text: "❌ Terjadi kesalahan saat memproses pesan.",
        });
      }
    }
  });
}

// ==========================================
// START APPLICATION
// ==========================================

startBot().catch((error) => {
  console.error("❌ BOT GAGAL START:", error);
});
