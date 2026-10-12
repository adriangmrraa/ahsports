import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * AES-256-GCM credential box.
 *
 * Secrets (bot tokens, provider keys, webhook secrets) are encrypted at rest
 * with `SECRET_ENCRYPTION_KEY`. The stored format is
 * `salt:iv:authTag:ciphertext` (all hex). Values are write-only: callers
 * receive [resolveSecretUpdate] to translate an admin submission into the next
 * stored value, and must never return the plaintext after saving.
 */

const ALGORITHM = "aes-256-gcm";
const SALT_BYTES = 16;
const IV_BYTES = 12;

/** Literal an admin sends to deliberately wipe a stored secret. */
export const SECRET_CLEAR = "CLEAR";

const ENCRYPTED_PATTERN = /^[0-9a-f]{32}:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i;

function getKey(salt: Buffer): Buffer {
  const secret = process.env.SECRET_ENCRYPTION_KEY;
  if (!secret) {
    // Encrypting with a known fallback would be worse than failing loudly.
    throw new Error("SECRET_ENCRYPTION_KEY is required to encrypt/decrypt credentials");
  }
  return scryptSync(secret, salt, 32);
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const salt = randomBytes(SALT_BYTES);
  const key = getKey(salt);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = cipher.update(plaintext, "utf8", "hex") + cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${salt.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptSecret(ciphertext: string): string {
  if (!ciphertext) return "";
  try {
    const [saltHex, ivHex, authTagHex, encrypted] = ciphertext.split(":");
    const salt = Buffer.from(saltHex, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, getKey(salt), iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
  } catch {
    // Never log the value or the error payload: it may contain secret material.
    return "";
  }
}

/** True if the value looks like our `salt:iv:authTag:ciphertext` format. */
export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && ENCRYPTED_PATTERN.test(value);
}

/**
 * Decrypts an encrypted value; returns plaintext values unchanged. Tolerant for
 * migration: rows written before encryption still resolve correctly and are
 * re-encrypted on the next save.
 */
export function decryptIfEncrypted(value: string | null | undefined): string {
  if (!value) return "";
  return isEncrypted(value) ? decryptSecret(value) : value;
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length < 8) return "••••••••";
  return value.slice(0, 4) + "••••••••" + value.slice(-4);
}

export type SecretResolution =
  | { action: "keep"; stored: string | null }
  | { action: "clear"; stored: null }
  | { action: "set"; stored: string };

/**
 * Write-only write pattern shared by every secret field:
 * - `undefined` / empty submission keeps the currently stored value;
 * - the literal `CLEAR` wipes it;
 * - any other value is encrypted and stored.
 */
export function resolveSecretUpdate(
  submitted: string | null | undefined,
  current: string | null,
): SecretResolution {
  if (submitted === SECRET_CLEAR) return { action: "clear", stored: null };
  if (submitted == null || submitted === "") return { action: "keep", stored: current };
  return { action: "set", stored: encryptSecret(submitted) };
}
