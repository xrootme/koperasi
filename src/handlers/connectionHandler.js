import qrcode from "qrcode-terminal";
import { DisconnectReason } from "@whiskeysockets/baileys";
import { cleanupOldSocket } from "./socketHelpers.js";

let currentSock = null;
let isReconnecting = false;
let reconnectTimer = null;

export function getCurrentSock() {
  return currentSock;
}

export function setCurrentSock(sock) {
  currentSock = sock;
}

export function clearCurrentSock() {
  currentSock = null;
}

export function setupConnectionHandler(sock, startBot) {
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("Silakan scan QR WhatsApp...");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("=================================");
      console.log("WHATSAPP BERHASIL TERHUBUNG");
      console.log("=================================");
      isReconnecting = false;
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const errorMsg = lastDisconnect?.error?.message || "Unknown error";

      console.log(`WHATSAPP TERPUTUS (Code: ${code || "none"}, Error: ${errorMsg})`);

      if (code === DisconnectReason.loggedOut) {
        console.log("PERANGKAT TELAH LOGOUT (401). Silakan hapus folder auth/baileys dan scan QR ulang.");
        return;
      }

      if (code === DisconnectReason.connectionReplaced) {
        console.log("SESSION WHATSAPP DIGANTIKAN DI TEMPAT LAIN. Bot dihentikan agar tidak terjadi konflik.");
        return;
      }

      if (isReconnecting) return;
      isReconnecting = true;

      console.log("Reconnect dalam 5 detik...");
      if (reconnectTimer) clearTimeout(reconnectTimer);

      reconnectTimer = setTimeout(async () => {
        isReconnecting = false;
        try {
          await startBot();
        } catch (err) {
          console.error("Gagal reconnect:", err?.message || err);
          setTimeout(() => {
            startBot().catch((e) => console.error("Gagal retry reconnect:", e?.message || e));
          }, 10_000);
        }
      }, 5000);
    }
  });
}

export async function cleanupSocket() {
  if (currentSock) {
    await cleanupOldSocket(currentSock);
    currentSock = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}