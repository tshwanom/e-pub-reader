import crypto from "crypto";

const ENCRYPTION_KEY = process.env.NEXTAUTH_SECRET || "default-secret-key-for-epub-reader-dev";

// Ensure the key is exactly 32 bytes for AES-256
const getSecretKey = () => {
  return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
};

export function encrypt(text: string): string {
  const key = getSecretKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

export function decrypt(text: string): string {
  try {
    const parts = text.split(":");
    const ivHex = parts.shift();
    const encryptedText = parts.join(":");
    if (!ivHex || !encryptedText) return "";
    
    const key = getSecretKey();
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error);
    return "";
  }
}
