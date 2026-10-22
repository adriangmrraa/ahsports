/**
 * Rate limiting with isolated per-route buckets.
 *
 * Port of SocialCRM `src/lib/infra/rate-limit.ts`, adapted to AH Sports'
 * dependency set: no `@upstash/*` packages may be added, so the store is the
 * in-memory sliding window in all environments. The Upstash path in the
 * source is intentionally dropped — if shared-store limiting is ever needed
 * it should come in through a port of this seam, not a dependency added ad
 * hoc. Semantics are identical: every request consumes one unit of its own
 * per-key window AND one unit of a per-bucket window.
 */

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  limit: number;
}

export interface RateLimitOptions {
  /**
   * Namespaced shared ceiling for a route/purpose (e.g. "leads",
   * "webhook:ycloud"). Defaults to the key prefix — everything before the
   * last ":" — so `leads:1.2.3.4` lands in bucket "leads". A dedicated bucket
   * is what stops an unauthenticated flood against one endpoint from
   * exhausting a global pool shared with inbound message processing (F3).
   */
  bucket?: string;
  /** Per-key limit within the window. Default 20/min. */
  limit?: number;
  /** Per-bucket shared limit within the window. Default 100/min. */
  bucketLimit?: number;
}

interface WindowEntry {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60_000;
const DEFAULT_KEY_LIMIT = 20;
const DEFAULT_BUCKET_LIMIT = 100;
const FALLBACK_BUCKET = "global";

const keyMap = new Map<string, WindowEntry>();
const bucketMap = new Map<string, WindowEntry>();

function checkWindow(
  map: Map<string, WindowEntry>,
  key: string,
  limit: number,
): RateLimitResult {
  const now = Date.now();
  const entry = map.get(key);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    map.set(key, { count: 1, windowStart: now });
    return { success: true, remaining: limit - 1, limit };
  }

  entry.count++;

  if (entry.count > limit) {
    return { success: false, remaining: 0, limit };
  }

  return { success: true, remaining: limit - entry.count, limit };
}

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of keyMap) {
    if (now - entry.windowStart >= WINDOW_MS) keyMap.delete(key);
  }
  for (const [key, entry] of bucketMap) {
    if (now - entry.windowStart >= WINDOW_MS) bucketMap.delete(key);
  }
}

if (typeof setInterval !== "undefined") {
  const timer = setInterval(cleanup, WINDOW_MS);
  // Never keep the process alive for the sweeper (route/module hot reloads,
  // script invocations under tsx).
  if (typeof timer === "object" && "unref" in timer) timer.unref();
}

/**
 * Shared-ceiling rate limit: every request consumes one unit of its own
 * per-key window AND one unit of a per-bucket window. Buckets isolate
 * failure domains — e.g. abuse of `/api/leads` saturates only the "leads"
 * bucket and can never starve "wa-inbound" message processing.
 *
 * Default bucket = the key's prefix (everything before the last ":"), so
 * callers get purpose isolation even without passing `bucket`.
 */
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const limit = options.limit ?? DEFAULT_KEY_LIMIT;
  const bucketLimit = options.bucketLimit ?? DEFAULT_BUCKET_LIMIT;
  const bucket =
    options.bucket ??
    (key.lastIndexOf(":") > 0
      ? key.slice(0, key.lastIndexOf(":"))
      : FALLBACK_BUCKET);

  const keyResult = checkWindow(keyMap, key, limit);
  if (!keyResult.success) return keyResult;

  return checkWindow(bucketMap, bucket, bucketLimit);
}

/**
 * Client IP for rate limiting. Only the RIGHT-MOST x-forwarded-for hop is
 * trusted: earlier entries are client-supplied and freely rotatable; the last
 * one was appended by the edge proxy (Render's router) that actually saw the
 * peer. With no trusted proxy in front there is no reliable client IP — a
 * fixed "unknown" bucket beats a spoofable key.
 */
export function clientIpFromRequest(request: { headers: Headers }): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const last = forwarded
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);
  return last ?? request.headers.get("x-real-ip")?.trim() ?? "unknown";
}

export function getRateLimitHeaders(
  success: boolean,
  remaining: number,
  limit: number,
): Record<string, string> {
  void success;
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Date.now() + WINDOW_MS),
  };
}
