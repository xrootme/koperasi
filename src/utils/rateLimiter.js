const buckets = new Map();
let cleanupInterval = null;

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

export function startCleanup(intervalMs = 60_000, maxAgeMs = 120_000) {
  if (cleanupInterval) {
    return cleanupInterval;
  }

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [k, v] of buckets) {
      if (now - v.start > maxAgeMs) {
        buckets.delete(k);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[RATE LIMITER] Cleaned ${cleaned} expired buckets`);
    }
  }, intervalMs);

  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return cleanupInterval;
}

export function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

export function getBucketCount() {
  return buckets.size;
}

export function clearAllBuckets() {
  buckets.clear();
}