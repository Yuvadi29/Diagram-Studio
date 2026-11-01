import { beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isEncryptionConfigured, secretHint } from "@/lib/crypto";

describe("API key encryption", () => {
  beforeEach(() => {
    process.env.API_KEY_ENCRYPTION_SECRET = "test-secret-that-is-long-enough-123";
  });

  it("round-trips and never stores the plaintext", () => {
    const key = "AIzaSyExampleKey1234";
    const enc = encryptSecret(key);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain(key);
    expect(decryptSecret(enc)).toBe(key);
    expect(encryptSecret(key)).not.toBe(enc); // random IV
  });

  it("detects tampering and a changed secret", () => {
    const enc = encryptSecret("AIzaSyExampleKey1234");
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
    process.env.API_KEY_ENCRYPTION_SECRET = "a-completely-different-secret-456";
    expect(() => decryptSecret(enc)).toThrow();
  });

  it("requires a configured secret", () => {
    process.env.API_KEY_ENCRYPTION_SECRET = "short";
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret("x")).toThrow(/API_KEY_ENCRYPTION_SECRET/);
  });

  it("exposes only the last four characters", () => {
    expect(secretHint("AIzaSyExampleKey1234")).toBe("…1234");
  });
});
