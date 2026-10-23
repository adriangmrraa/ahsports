import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, clientIpFromRequest } from "@/lib/infra/rate-limit";

/**
 * Shared auth for `/api/cron/*` endpoints — port of SocialCRM
 * `src/lib/auth/cron-auth.ts`.
 *
 * The secret travels in `Authorization: Bearer <CRON_SECRET>` (fallback
 * `AGENT_CRON_SECRET`, matching the existing reconcile routes) and never in
 * the query string, where it would land in proxy/access logs, shell history
 * and prefetched URLs. Requests are rate-limited per client IP before the
 * secret compare so guessing gets throttled.
 *
 * Legacy `?key=` is honored ONLY when `CRON_ALLOW_QUERY_KEY=1` is set — an
 * explicit escape hatch for schedulers that cannot send headers. With the
 * flag unset a query key is rejected even when valid, so leaked URLs stay
 * inert.
 */

const CRON_RATE_LIMIT = 10;
const CRON_RATE_BUCKET = 60;

/** Constant-time compare; an unset/empty expected secret fails closed. */
export function cronSecretMatches(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function expectedCronSecret(): string {
  return (process.env.CRON_SECRET ?? process.env.AGENT_CRON_SECRET ?? "").trim();
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

function queryKeyAllowed(): boolean {
  return process.env.CRON_ALLOW_QUERY_KEY === "1";
}

/**
 * Returns null when the request is authorized, or the NextResponse to send
 * (401 missing/bad secret, 429 over the per-IP limit).
 */
export async function authorizeCronRequest(
  request: Request,
): Promise<NextResponse | null> {
  const rate = await checkRateLimit(`cron:${clientIpFromRequest(request)}`, {
    bucket: "cron",
    limit: CRON_RATE_LIMIT,
    bucketLimit: CRON_RATE_BUCKET,
  });
  if (!rate.success) {
    return NextResponse.json(
      { error: "Demasiados pedidos" },
      { status: 429 },
    );
  }

  const expected = expectedCronSecret();
  if (cronSecretMatches(bearerToken(request), expected)) return null;

  // Query-string secret: only as an explicit opt-in for headerless callers.
  if (queryKeyAllowed()) {
    const key = new URL(request.url).searchParams.get("key");
    if (cronSecretMatches(key, expected)) return null;
  }

  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}
