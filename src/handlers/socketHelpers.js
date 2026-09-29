import { downloadMediaMessage } from "@whiskeysockets/baileys";
import pino from "pino";

export function unwrapMessage(rawMsg) {
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

export async function safeSendMessage(sock, jid, content) {
  if (!sock || !jid) return null;
  try {
    return await sock.sendMessage(jid, content);
  } catch (err) {
    console.error(`Gagal kirim pesan ke ${jid}:`, err?.message || err);
    return null;
  }
}

export async function cleanupOldSocket(sock) {
  if (!sock) return;
  try {
    sock.ev?.removeAllListeners();
    sock.ws?.close();
  } catch {
    // Ignore cleanup errors
  }
}

export async function downloadMediaMessageSafe(msg) {
  return await downloadMediaMessage(
    msg,
    "buffer",
    {},
    {
      logger: pino({ level: "silent" }),
    },
  );
}