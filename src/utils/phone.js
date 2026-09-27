export function normalizePhone(phone) {
  let value = String(phone || "").trim();

  value = value.split("@")[0];

  value = value.replace(/\D/g, "");

  if (!value) return "";

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

    if (raw.endsWith("@lid")) {
      continue;
    }

    const phone = normalizePhone(raw);

    if (!phone) continue;

    if (phone.startsWith("62")) {
      return phone;
    }
  }

  return "";
}