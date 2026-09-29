import dotenv from "dotenv";
dotenv.config();

import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
import pino from "pino";

import { validateConfig } from "./src/config/index.js";
import { startCleanup as startRateLimiterCleanup } from "./src/utils/rateLimiter.js";
import { handleMessage } from "./src/handlers/messageHandler.js";
import { setupConnectionHandler, cleanupSocket } from "./src/handlers/connectionHandler.js";

validateConfig();

startRateLimiterCleanup(60_000, 120_000);

process.on("uncaughtException", (error) => {
  console.error("[UNCAUGHT EXCEPTION]:", error?.stack || error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[UNHANDLED REJECTION]:", reason);
});

async function startBot() {
  await cleanupSocket();

  const { state, saveCreds } = await useMultiFileAuthState("./auth/baileys");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
  });

  setupConnectionHandler(sock, startBot);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages?.[0];
      if (!msg) return;
      await handleMessage(sock, msg);
    } catch (error) {
      console.error("ERROR PROCESS:", error?.message || error);
    }
  });
}

startBot().catch((error) => {
  console.error("BOT GAGAL START:", error);
});