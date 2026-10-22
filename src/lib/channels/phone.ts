/**
 * Canonical phone handling for channel identity matching.
 *
 * Provider identities and configured sender addresses arrive in any (+/digits)
 * form; all comparisons run on digits-only canonical values so `+54 9 ...`,
 * `549...`, and `549... ` collapse to the same key.
 */

/** Digits-only canonical form: "+54 9 3704 111111" → "5493704111111". */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/**
 * A value is phone-like only when it is composed of phone punctuation/digits
 * and has a plausible length. Provider ids such as `waba-2` or `acc-123` are
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
