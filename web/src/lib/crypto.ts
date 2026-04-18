import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.AGENT_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("AGENT_ENCRYPTION_KEY environment variable is required (32-byte hex string)");
  }
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error("AGENT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return buf;
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns a base64-encoded string in the format: iv:authTag:ciphertext
 */
export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypts a string produced by encrypt().
 * Expects base64-encoded format: iv:authTag:ciphertext
 */
export function decrypt(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const ciphertext = parts[2];

  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid IV length");
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid auth tag length");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
