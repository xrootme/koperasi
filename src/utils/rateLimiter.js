const buckets = new Map();

export function allow(key, limit = 5, windowMs = 60_000) {
  const now = Date.now();
  let rec = buckets.get(key);
  if (!rec || now - rec.start > windowMs) {
    rec = { count: 1, start: now };
    buckets.set(key, rec);
    return true;
  }
  if (rec.count < limit) {
    rec.count += 1;
    return true;
  }
  return false;
}

export function remainingMs(key, windowMs = 60_000) {
  const rec = buckets.get(key);
  if (!rec) return 0;
  return Math.max(0, windowMs - (Date.now() - rec.start));
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (now - v.start > 120_000) buckets.delete(k);
  }
}, 60_000).unref?.();
