import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, "processed.json");

function loadProcessed() {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(
        filePath,
        JSON.stringify(
          {
            messageIds: [],
            imageHashes: [],
          },
          null,
          2,
        ),
        "utf8",
      );
    }

    const data = fs.readFileSync(filePath, "utf8");

    const parsed = JSON.parse(data);

    return {
      messageIds: new Set(parsed.messageIds || []),
      imageHashes: new Set(parsed.imageHashes || []),
    };
  } catch (error) {
    console.error("Gagal membaca processed.json:", error);

    return {
      messageIds: new Set(),
      imageHashes: new Set(),
    };
  }
}

const processed = loadProcessed();

function saveProcessed() {
  try {
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          messageIds: [...processed.messageIds],
          imageHashes: [...processed.imageHashes],
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch (error) {
    console.error("Gagal menyimpan processed.json:", error);
  }
}

export function getImageHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function isMessageProcessed(messageId) {
  if (!messageId) {
    return false;
  }

  if (processed.messageIds.has(messageId)) {
    console.log("⚠️ MESSAGE ID SUDAH DIPROSES:", messageId);

    return true;
  }

  return false;
}

export function isImageProcessed(buffer) {
  if (!buffer) {
    return false;
  }

  const hash = getImageHash(buffer);

  if (processed.imageHashes.has(hash)) {
    console.log("⚠️ GAMBAR SUDAH DIPROSES:", hash);

    return true;
  }

  return false;
}

export function markProcessed(messageId, buffer) {
  if (messageId) {
    processed.messageIds.add(messageId);
  }

  if (buffer) {
    const hash = getImageHash(buffer);

    processed.imageHashes.add(hash);

    console.log("✅ IMAGE HASH DISIMPAN:", hash);
  }

  saveProcessed();

  console.log("✅ DATA PROSES DISIMPAN");
}