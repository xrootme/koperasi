import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, "..", "..", "processed.json");
const MAX_STORED_ENTRIES = 5000;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function trimSet(set, maxSize) {
  if (set.size > maxSize) {
    const arr = Array.from(set);
    const toRemove = arr.slice(0, arr.length - maxSize);
    for (const item of toRemove) {
      set.delete(item);
    }
  }
}

function loadProcessed() {
  try {
    if (!fs.existsSync(filePath)) {
      return { messageIds: new Set(), imageHashes: new Set() };
    }

    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE_BYTES) {
      console.warn(`[PROCESSED] File too large (${stats.size} bytes), resetting`);
      return { messageIds: new Set(), imageHashes: new Set() };
    }

    const data = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(data);

    return {
      messageIds: new Set(parsed.messageIds || []),
      imageHashes: new Set(parsed.imageHashes || []),
    };
  } catch (error) {
    console.error("Gagal membaca processed.json:", error?.message || error);
    return { messageIds: new Set(), imageHashes: new Set() };
  }
}

const processed = loadProcessed();

function saveProcessed() {
  try {
    trimSet(processed.messageIds, MAX_STORED_ENTRIES);
    trimSet(processed.imageHashes, MAX_STORED_ENTRIES);

    const jsonString = JSON.stringify(
      {
        messageIds: [...processed.messageIds],
        imageHashes: [...processed.imageHashes],
      },
      null,
      2,
    );

    if (jsonString.length > MAX_FILE_SIZE_BYTES) {
      console.warn("[PROCESSED] JSON too large, truncating");
      trimSet(processed.messageIds, Math.floor(MAX_STORED_ENTRIES * 0.5));
      trimSet(processed.imageHashes, Math.floor(MAX_STORED_ENTRIES * 0.5));
    }

    fs.writeFileSync(filePath, jsonString, "utf8");
  } catch (error) {
    console.error("Gagal menyimpan processed.json:", error?.message || error);
  }
}

export function getImageHash(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return "";
  }
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function isMessageProcessed(messageId) {
  if (!messageId) {
    return false;
  }

  if (processed.messageIds.has(String(messageId))) {
    console.log("Message ID sudah diproses:", messageId);
    return true;
  }

  return false;
}

export function isImageProcessed(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return false;
  }

  const hash = getImageHash(buffer);
  if (!hash) return false;

  if (processed.imageHashes.has(hash)) {
    console.log("Gambar sudah diproses:", hash);
    return true;
  }

  return false;
}

export function markProcessed(messageId, buffer) {
  let changed = false;

  if (messageId) {
    const idStr = String(messageId);
    if (!processed.messageIds.has(idStr)) {
      processed.messageIds.add(idStr);
      changed = true;
    }
  }

  if (buffer && Buffer.isBuffer(buffer)) {
    const hash = getImageHash(buffer);
    if (hash && !processed.imageHashes.has(hash)) {
      processed.imageHashes.add(hash);
      console.log("Image hash disimpan:", hash);
      changed = true;
    }
  }

  if (changed) {
    saveProcessed();
    console.log("Data proses disimpan");
  }
}

export function clearProcessed() {
  processed.messageIds.clear();
  processed.imageHashes.clear();
  saveProcessed();
  console.log("Processed data cleared");
}

export function getProcessedStats() {
  return {
    messageIds: processed.messageIds.size,
    imageHashes: processed.imageHashes.size,
  };
}