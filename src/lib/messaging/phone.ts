/**
 * Phone identity helpers for the messaging layer.
 *
 * Verbatim port of SocialCRM `src/lib/phone-utils.ts` (AH Sports has no shared
 * phone module, so the minimal surface lives inside `src/lib/messaging/`).
 *
 * `looksLikePhone` is the guard that keeps provider-side identities that are
 * not phones (BSUIDs, waba ids, scoped social ids) out of digit-stripping
 * normalization — `normalizePhone` must only run on phone-shaped values.
 */

/**
 * Normalizes a phone number to a canonical DIGITS-ONLY form.
 * Strips +, spaces, dashes, parentheses and any non-digit character.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/**
 * Validates that a normalized phone has a valid Argentine format
 * (starts with 549, between 10 and 13 digits).
 *
 * @example
 *   isValidPhone("5493704111111")  // → true
 *   isValidPhone("1141234567")     // → false
 */
export function isValidPhone(phone: string): boolean {
  return /^549\d{7,11}$/.test(phone);
}

/**
 * A value is phone-like only when it is composed of phone punctuation/digits
 * and has a plausible length. Provider IDs such as `waba-2` or `acc-123` are
 * NOT phone-like, so they are never matched by digit suffix.
 */
export function looksLikePhone(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    /^[+\d\s().-]+$/.test(trimmed) &&
    normalizePhone(trimmed).length >= 7
  );
}

/** Compare configured identities using the same canonical digits on both sides. */
export function phoneMatches(a: string, b: string): boolean {
  if (!looksLikePhone(a) || !looksLikePhone(b)) return false;
  const left = normalizePhone(a);
  return left.length > 0 && left === normalizePhone(b);
}

export function phoneInList(phone: string, entries: readonly { phone: string }[]): boolean {
  return entries.some((entry) => phoneMatches(phone, entry.phone));
}
