// Server-only — never import from "use client" code (uses Node crypto).
// Port of SocialCRM `src/lib/attribution/ref-code-sign.ts`; the HMAC key is
// derived from AH's SESSION_SECRET with domain separation (below) so the ref
// protocol never reuses the session-cookie key verbatim.
import { createHmac, timingSafeEqual } from "crypto";
import { getSessionSecret } from "@/lib/env";
import { decodeRefCode, type RefCodeData } from "./ref-code";

const SIG_LEN = 16;

/**
 * Domain-separated sub-key: `hmac(secret, "ref-code")`. Keeps ref-code
 * signatures in their own key space, so a weakness in one protocol cannot
 * cross over to the other.
 */
function refCodeKey(): Buffer {
  return createHmac("sha256", getSessionSecret()).update("ref-code").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", refCodeKey()).update(payload).digest("hex").slice(0, SIG_LEN);
}

/**
 * Signed ref format: `ref:{campaignId}_{adsetId}_{adId}_{ts36}_{hmac16}`
 * Extends the legacy 4-part code with an HMAC so attribution data carried in
 * public wa.me links cannot be tampered with without detection.
 */
export function signRefCode(data: RefCodeData): string {
  const payload = `${data.campaignId}_${data.adsetId}_${data.adId}_${data.timestamp.toString(36)}`;
  return `ref:${payload}_${sign(payload)}`;
}

/**
 * Returns true when `code` is a 5-part signed ref whose signature is valid.
 */
export function verifyRefCodeSignature(code: string): boolean {
  const stripped = code.startsWith("ref:") ? code.slice(4) : code;
  const parts = stripped.split("_");
  if (parts.length !== 5) return false;
  const payload = parts.slice(0, 4).join("_");
  const expected = sign(payload);
  const given = parts[4];
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export interface RefAttribution {
  campaignId: string;
  adsetId: string;
  adId: string;
}

/**
 * Resolves a raw `ref:` code to ad-attribution ids, accepting ONLY codes whose
 * HMAC verifies. Returns null for malformed codes, unsigned 4-part codes, and
 * signed codes whose signature fails — callers stamp the result only onto
 * empty attribution fields (first attribution wins).
 *
 * 4-part codes are rejected on purpose: SocialCRM kept them for ads already
 * published in the wild, but AH has never minted an unsigned code, and
 * `ref:fake_fake_fake_1` is attacker-controlled from both `/api/leads` and
 * every inbound message. The raw `refCode` is still stored by callers for
 * forensics; only the carried campaign/ad ids are dropped.
 */
export function resolveAttributionFromRef(refCode: string | null): RefAttribution | null {
  if (!refCode) return null;
  try {
    const decoded = decodeRefCode(refCode);
    if (!decoded) return null;
    if (!decoded.signed) {
      console.warn("[attribution] unsigned ref code — dropping attribution");
      return null;
    }
    if (!verifyRefCodeSignature(refCode)) {
      console.warn("[attribution] ref code signature invalid — dropping attribution");
      return null;
    }
    return {
      campaignId: decoded.campaignId,
      adsetId: decoded.adsetId,
      adId: decoded.adId,
    };
  } catch (err) {
    console.warn("[attribution] ref code resolution failed — skipping", err);
    return null;
  }
}
