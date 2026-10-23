import type { NextRequest } from "next/server";

/**
 * CORS for the public lead-capture endpoint.
 *
 * Browser automation with `Content-Type: application/json` triggers a
 * preflight, which previously had no `OPTIONS` handler → 405. Origins come
 * from `LEADS_CORS_ORIGINS` (comma-separated, `*` allowed); with no env
 * configured nothing is echoed, i.e. cross-origin is denied by default and
 * only same-origin / server-to-server calls work.
 */
function parseAllowedOrigins(): string[] {
  const raw = process.env.LEADS_CORS_ORIGINS ?? "";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin) return {};

  const allowed = parseAllowedOrigins();
  const wildcard = allowed.includes("*");
  if (!wildcard && !allowed.includes(origin)) return {};

  return {
    "Access-Control-Allow-Origin": wildcard ? "*" : origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
