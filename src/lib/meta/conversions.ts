import "server-only";

import { createHash } from "node:crypto";

import { resolvePixelId } from "./pixel-id";

/**
 * Meta Conversions API (CAPI) sender — server-side counterpart of the pixel
 * (H-04). Fires events with deterministic `event_id`s so Meta dedups them
 * against any client-side pixel delivery of the same event.
 *
 * Config:
 *  - Pixel id: `settings["meta_pixel_id"]`, fallback `META_PIXEL_ID` env.
 *  - Token: `META_CAPI_TOKEN` env (secret — never in the DB).
 *
 * Contract: best-effort fire-and-forget. Never throws, never blocks on
 * config; a missing token/pixel returns `{ ok: false, reason: "not_configured" }`
 * (mirrors the YCloud send gate). Failures are logged WITHOUT PII.
 */

const META_GRAPH_VERSION = "v21.0";
const META_CAPI_TIMEOUT_MS = 8_000;

export type MetaConversionEventName =
  | "Lead"
  | "Purchase"
  | "Contact"
  | "PageView"
  | "CompleteRegistration"
  | (string & {});

export interface MetaConversionUserData {
  /** Raw phone — sha256-hashed after digit normalization. Never sent plain. */
  phone?: string | null;
  /** Raw email — sha256-hashed after lowercase trim. Never sent plain. */
  email?: string | null;
  /** First name — sha256-hashed. */
  firstName?: string | null;
  /** Last name — sha256-hashed. */
  lastName?: string | null;
  /** Click/browser ids from Meta cookies, sent unhashed per CAPI spec. */
  fbc?: string | null;
  fbp?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
}

export interface MetaConversionCustomData {
  value?: number;
  currency?: string;
  contentName?: string;
  contentCategory?: string;
  [key: string]: unknown;
}

export interface MetaConversionInput {
  eventName: MetaConversionEventName;
  /**
   * Deterministic dedup key (e.g. `lead_<uuid>`). Meta collapses deliveries
   * sharing (event_name, event_id) across pixel + CAPI.
   */
  eventId: string;
  eventSourceUrl?: string | null;
  eventTime?: number;
  userData?: MetaConversionUserData;
  customData?: MetaConversionCustomData;
}

export type MetaConversionResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "request_failed" | "bad_response" };

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashPhone(phone: string): string {
  return sha256Hex(phone.replace(/[^\d]/g, ""));
}

function hashEmail(email: string): string {
  return sha256Hex(email.trim().toLowerCase());
}

function hashName(name: string): string {
  return sha256Hex(name.trim().toLowerCase());
}

export async function sendMetaConversion(
  input: MetaConversionInput
): Promise<MetaConversionResult> {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return { ok: false, reason: "not_configured" };

  const pixelId = await resolvePixelId();
  if (!pixelId) return { ok: false, reason: "not_configured" };

  const userData: Record<string, unknown> = {};
  const u = input.userData ?? {};
  if (u.phone) userData.ph = [hashPhone(u.phone)];
  if (u.email) userData.em = [hashEmail(u.email)];
  if (u.firstName) userData.fn = [hashName(u.firstName)];
  if (u.lastName) userData.ln = [hashName(u.lastName)];
  if (u.fbc) userData.fbc = u.fbc;
  if (u.fbp) userData.fbp = u.fbp;
  if (u.clientIpAddress) userData.client_ip_address = u.clientIpAddress;
  if (u.clientUserAgent) userData.client_user_agent = u.clientUserAgent;

  const event: Record<string, unknown> = {
    event_name: input.eventName,
    event_id: input.eventId,
    event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
    action_source: "website",
    user_data: userData,
  };
  if (input.eventSourceUrl) event.event_source_url = input.eventSourceUrl;
  if (input.customData && Object.keys(input.customData).length > 0) {
    event.custom_data = input.customData;
  }

  try {
    // Token travels in the body, not the query string: URLs are far more
    // likely to be captured by HTTP client/proxy logs than request bodies.
    const res = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${pixelId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [event], access_token: token }),
        signal: AbortSignal.timeout(META_CAPI_TIMEOUT_MS),
      }
    );
    if (!res.ok) {
      // Body may carry Meta's error detail; never contains our PII back.
      console.warn(
        `[meta:capi] ${input.eventName} ${input.eventId} — graph responded ${res.status}`
      );
      return { ok: false, reason: "bad_response" };
    }
    return { ok: true };
  } catch (err) {
    console.warn(
      `[meta:capi] ${input.eventName} ${input.eventId} — send failed:`,
      err instanceof Error ? err.message : err
    );
    return { ok: false, reason: "request_failed" };
  }
}
