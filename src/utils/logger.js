export function maskPhone(p) {
  if (!p) return "-";
  const s = String(p);
  if (s.length <= 4) return "****";
  return s.slice(0, 4) + "****" + s.slice(-2);
}

export function maskId(id) {
  if (!id) return "-";
  const s = String(id);
  if (s.length <= 4) return "***";
  return s.slice(0, 3) + "***";
}

export function maskText(text, maxLen = 30) {
  if (!text) return "[kosong]";
  const s = String(text);
  if (s.length > maxLen) return s.slice(0, maxLen) + "…";
  return s;
}
