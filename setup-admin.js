import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, ".env");

function generateSecureSecret(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

function generateAdminToken(phone, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const data = `${phone}:${timestamp}`;
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("hex");

  return `${data}:${hmac}`;
}

async function setupAdminAuth() {
  console.log("");
  console.log("=================================");
  console.log("   SETUP ADMIN AUTHENTICATION");
  console.log("=================================");
  console.log("");

  // Read existing .env
  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8");
  }

  // Parse existing values
  const envLines = envContent.split("\n");
  const envObj = {};

  for (const line of envLines) {
    if (line && !line.startsWith("#")) {
      const [key, ...valueParts] = line.split("=");
      envObj[key.trim()] = valueParts.join("=").trim();
    }
  }

  // Generate new admin secret if not exists
  if (!envObj.ADMIN_SECRET) {
    const secret = generateSecureSecret(32);
    envObj.ADMIN_SECRET = secret;
    console.log("✅ Generated ADMIN_SECRET (32 bytes)");
    console.log("");
  } else {
    console.log("ℹ️  ADMIN_SECRET already exists in .env");
    console.log("");
  }

  // Setup admin phones if not exists
  if (!envObj.ADMIN_PHONES) {
    const defaultAdmin = "62895634117345";
    envObj.ADMIN_PHONES = defaultAdmin;
    console.log(`✅ Set ADMIN_PHONES to: ${defaultAdmin}`);
    console.log("");
  } else {
    console.log(`ℹ️  ADMIN_PHONES already set: ${envObj.ADMIN_PHONES}`);
    console.log("");
  }

  // Generate sample admin token
  const adminPhones = envObj.ADMIN_PHONES.split(",").map(p => p.trim());
  const firstPhone = adminPhones[0];
  const token = generateAdminToken(firstPhone, envObj.ADMIN_SECRET);

  console.log("📋 GENERATED ADMIN TOKEN");
  console.log("=================================");
  console.log(`Phone: ${firstPhone}`);
  console.log(`Token: ${token}`);
  console.log("Valid for: 1 hour");
  console.log("");
  console.log("⚠️  KEEP THIS TOKEN SECRET!");
  console.log("");

  // Write back to .env
  const newEnvContent = Object.entries(envObj)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  fs.writeFileSync(envPath, newEnvContent, "utf-8");
  console.log("✅ .env file updated");
  console.log("");

  console.log("=================================");
  console.log("   NEXT STEPS");
  console.log("=================================");
  console.log("");
  console.log("1. Store ADMIN_SECRET in secure location (AWS Secrets Manager, Vault)");
  console.log("2. Never commit ADMIN_SECRET to git");
  console.log("3. Use the generated token when calling /add command");
  console.log("4. Rotate ADMIN_SECRET monthly");
  console.log("");
  console.log("Usage:");
  console.log("  /add_token <token> <name> <phone> <pinjaman> <tenor> <angsuran>");
  console.log("");
}

setupAdminAuth().catch((error) => {
  console.error("❌ Setup failed:", error.message);
  process.exit(1);
});
