import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta / WhatsApp Cloud API webhook signature verification.
 *
 * Meta signs the RAW request body with the app secret and sends the result in
 * the `X-Hub-Signature-256` header as `sha256=<hex HMAC-SHA256>`. Verification
 * must run against the exact bytes received, before any side effect. The app
 * secret and the raw body are never logged or returned; only a boolean leaves
 * this module.
 *
 * This module is intentionally `server-only`-free (no DB, no Next runtime) so
 * the constant-time verifier can be exercised by a DB-free check.
 */

export const WHATSAPP_SIGNATURE_HEADER = "x-hub-signature-256";
export const WHATSAPP_SIGNATURE_PREFIX = "sha256=";

const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/i;

/** Reads the signature header off a request (empty string when absent). */
export function whatsappSignatureHeader(request: Request): string {
  return request.headers.get(WHATSAPP_SIGNATURE_HEADER) ?? "";
}

/** Computes the expected header value for a raw body. Never logs its inputs. */
export function computeWhatsAppSignature(appSecret: string, rawBody: string): string {
  const digest = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return `${WHATSAPP_SIGNATURE_PREFIX}${digest}`;
}

/**
 * Verifies `X-Hub-Signature-256` against the app secret over the raw body.
 *
 * Returns false on any malformed input (missing secret, missing/`!sha256=`-
 * prefixed/wrong-length header) and uses a constant-time comparison so a
 * caller cannot learn the expected digest from timing. The HMAC is computed
 * even for malformed input so the reject path stays uniform.
 */
export function verifyWhatsAppSignature(input: {
  appSecret: string;
  rawBody: string;
  header: string;
}): boolean {
  if (!input.appSecret) return false;

  const expectedHex = createHmac("sha256", input.appSecret)
    .update(input.rawBody, "utf8")
    .digest("hex");

  const providedHex = input.header.startsWith(WHATSAPP_SIGNATURE_PREFIX)
    ? input.header.slice(WHATSAPP_SIGNATURE_PREFIX.length)
    : "";

  if (!HEX_SHA256_PATTERN.test(providedHex) || providedHex.length !== expectedHex.length) {
    return false;
  }

  const provided = Buffer.from(providedHex.toLowerCase(), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
