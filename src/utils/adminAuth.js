import crypto from "crypto";

// Admin tokens berdasarkan phone number + secret
// Generate: generateAdminToken("62895634117345", "your-secret-key")
// Verify: verifyAdminToken(token, "your-secret-key")

function getAdminPhonesList() {
  return (process.env.ADMIN_PHONES || "").split(",").map((p) => p.trim()).filter(Boolean);
}
function getAdminSecret() {
  return process.env.ADMIN_SECRET || "";
}

export function generateAdminToken(phone, secret) {
  const s = secret ?? getAdminSecret();
  if (!s) {
    throw new Error("ADMIN_SECRET is required");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const data = `${phone}:${timestamp}`;
  const hmac = crypto
    .createHmac("sha256", s)
    .update(data)
    .digest("hex");

  return `${data}:${hmac}`;
}

export function verifyAdminToken(token, secret) {
  const s = secret ?? getAdminSecret();
  if (!s) {
    throw new Error("ADMIN_SECRET is required");
  }

  const parts = token.split(":");
  if (parts.length !== 3) {
    return { valid: false, phone: null };
  }

  const [phone, timestamp, providedHmac] = parts;
  const currentTime = Math.floor(Date.now() / 1000);
  const tokenAge = currentTime - Number(timestamp);

  if (tokenAge > 3600) {
    return { valid: false, phone, reason: "Token expired" };
  }

  const data = `${phone}:${timestamp}`;
  const expectedHmac = crypto
    .createHmac("sha256", s)
    .update(data)
    .digest("hex");

  if (providedHmac !== expectedHmac) {
    return { valid: false, phone, reason: "Invalid signature" };
  }

  if (!getAdminPhonesList().includes(phone)) {
    return { valid: false, phone, reason: "Not authorized" };
  }

  return { valid: true, phone };
}

export function isAdminPhone(phone) {
  return getAdminPhonesList().includes(phone);
}

export function getAdminPhones() {
  return [...getAdminPhonesList()];
}