import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for user-supplied secrets (e.g. Gemini API keys) at rest.
 * AES-256-GCM with a key derived from API_KEY_ENCRYPTION_SECRET.
 * Format: v1:<iv b64>:<auth tag b64>:<ciphertext b64>
 */

function key(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET ?? "";
  if (secret.length < 16) {
    throw new Error("API_KEY_ENCRYPTION_SECRET is missing or too short. Set it to a long random string (e.g. `openssl rand -base64 32`).");
  }
  return createHash("sha256").update(secret).digest();
}

export function isEncryptionConfigured(): boolean {
  return (process.env.API_KEY_ENCRYPTION_SECRET ?? "").length >= 16;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unsupported secret format.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** Last 4 characters only, safe to show in the UI. */
export function secretHint(plain: string): string {
  return `…${plain.trim().slice(-4)}`;
}
