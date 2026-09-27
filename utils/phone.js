export function normalizePhone(phone) {
  let value = String(phone || "").trim();

  // Buang suffix JID
  value = value.split("@")[0];

  // Hanya angka
  value = value.replace(/\D/g, "");

  if (!value) return "";

  // 08xxxxxxxx -> 628xxxxxxxx
  if (value.startsWith("0")) {
    value = "62" + value.slice(1);
  }

  return value;
}

export function jidToPhone(jid) {
  return normalizePhone(jid);
}

export function isLid(jid) {
  return String(jid || "").endsWith("@lid");
}

export function getMessagePhone(msg) {
  const key = msg?.key || {};

  /*
   * Prioritas:
   *
   * 1. remoteJidAlt
   * 2. senderPn
   * 3. participantPn
   * 4. phoneNumber
   * 5. remoteJid
   * 6. participant
   *
   * remoteJidAlt sangat penting pada pesan dengan addressingMode = lid.
   */

  const candidates = [
    key.remoteJidAlt,
    key.senderPn,
    key.participantPn,
    key.phoneNumber,
    key.remoteJid,
    key.participant,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const raw = String(candidate);

    // Jangan gunakan LID sebagai nomor telepon
    if (raw.endsWith("@lid")) {
      continue;
    }

    const phone = normalizePhone(raw);

    if (!phone) continue;

    // Untuk Indonesia, nomor harus diawali 62
    if (phone.startsWith("62")) {
      return phone;
    }
  }

  return "";
}
