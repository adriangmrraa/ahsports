// Port of SocialCRM `src/lib/attribution/ref-code.ts` + the `ref:CODE`
// extractor that lived in `lib/whatsapp/lead-capture.ts` (single home here —
// both the mint/decode helpers and the inbound extractor are attribution
// primitives).

export interface RefCodeData {
  campaignId: string;
  adsetId: string;
  adId: string;
  timestamp: number;
  /** True for signed 5-part codes — verify with verifyRefCodeSignature (server). */
  signed?: boolean;
}

/**
 * Extracts a `ref:CODE` token from free text (the first message of a wa.me
 * deep link conversation, or a lead-capture payload). Returns the code
 * without the `ref:` prefix, or null when absent.
 */
export function extractRefCode(text: string): string | null {
  const match = text.match(/ref:([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

/**
 * Decodes a ref code string back into RefCodeData.
 * Accepts codes with or without the "ref:" prefix.
 * Accepts 4-part legacy codes and 5-part signed codes (signature is NOT
 * verified here — call verifyRefCodeSignature server-side for that).
 * Returns null on malformed input.
 */
export function decodeRefCode(code: string): RefCodeData | null {
  if (!code) return null;

  const stripped = code.startsWith("ref:") ? code.slice(4) : code;
  const parts = stripped.split("_");

  if (parts.length !== 4 && parts.length !== 5) return null;

  const [campaignId, adsetId, adId, timestampBase36] = parts;

  if (!campaignId || !adsetId || !adId || !timestampBase36) return null;

  const timestamp = parseInt(timestampBase36, 36);

  if (isNaN(timestamp)) return null;

  return { campaignId, adsetId, adId, timestamp, signed: parts.length === 5 };
}

/**
 * Builds a WhatsApp deep link with the ref code embedded in the message text.
 */
export function buildWhatsAppLink(
  phone: string,
  refCode: string,
  greeting = "Hola! Vi su anuncio y me interesa"
): string {
  const text = `${greeting} ${refCode}`.trim();
  const encoded = encodeURIComponent(text);
  return `https://wa.me/${phone}?text=${encoded}`;
}
