import "server-only";

import { headers } from "next/headers";

import {
  checkRateLimit,
  clientIpFromRequest,
  type RateLimitOptions,
  type RateLimitResult,
} from "./rate-limit";

/**
 * G-02 — per-IP limit for public GET pages (RSC). Route handlers can read
 * the request object directly; server components get headers via
 * `next/headers`. `bucket` doubles as the key prefix so every route lands
 * in its own isolated bucket.
 */
export async function checkPublicGetRateLimit(
  bucket: string,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const ip = clientIpFromRequest({ headers: await headers() });
  return checkRateLimit(`${bucket}:${ip}`, { bucket, ...options });
}
