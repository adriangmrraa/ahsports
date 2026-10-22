/**
 * YCloud adapter — port of SocialCRM `src/lib/messaging/providers/ycloud.ts`.
 *
 * Delegation map adaptations for AH Sports:
 * - verifyWebhook → YCloud `t,s` timestamped HMAC-SHA256 is folded INTO this
 *   module (`verifyYCloudSignature` / `ycloudTimestampInWindow` /
 *   `parseSignatureHeader` below, ported from SocialCRM
 *   `src/lib/whatsapp/signature.ts`). AH's `src/lib/channels/signature.ts`
 *   implements the Meta `sha256=` scheme for the import route and MUST NOT be
 *   reused here — the schemes are not interchangeable.
 * - sendMessage   → SocialCRM delegated to `src/lib/ycloud.ts`
 *   sendText/sendImage/sendDocument (sendDirectly + retry-on-5xx + wamid
 *   capture, resolving agent_config → env inside). AH has no such client, so
 *   the env-resolved sender lives here (`legacySend*`) with the same wire
 *   shape and retry semantics, honoring AH's `YCLOUD_BASE_URL` env seam
 *   (`src/lib/channels/whatsapp/send.ts`).
 * - parseWebhook  → normalizes the payloads handled by the YCloud webhook
 *   (inbound, echo, status). Dedup mirrors the route exactly: inbound
 *   `platformMessageId` prefers `message.id` and echoes use `msg.id ||
 *   event.id`; on echoes the business is the sender (`sender.phone`) while
 *   the customer — the conversation routing key — is exposed via
 *   `providerConversationId`.
 * - resolveMedia  → GET /v2/whatsapp/media/{id} metadata step.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { isSymbolicAccountId } from "../accounts";
import type {
  ChannelAccount,
  MessagingProvider,
  NormalizedInboundEvent,
  OutboundMessage,
  SendResult,
} from "../types";

const SIGNATURE_HEADER = "ycloud-signature";
const DEFAULT_YCLOUD_BASE_URL = "https://api.ycloud.com";
const YCLOUD_SEND_PATH = "/v2/whatsapp/messages/sendDirectly";
const INBOUND_EVENT_TYPE = "whatsapp.inbound_message.received";
const STATUS_EVENT_TYPE = "whatsapp.message.updated";
const MAX_SIGNATURE_AGE_SEC = 300;
const LEGACY_SEND_ATTEMPTS = 3;
const LEGACY_SEND_TIMEOUT_MS = 20_000;

/**
 * Clock-skew allowance for FUTURE timestamps, in seconds. The replay window
 * is asymmetric: provider clocks can legitimately drift a few seconds ahead
 * of ours, but accepting a timestamp far in the future hands a captured
 * signature a long validity window.
 */
export const YCLOUD_MAX_FUTURE_SKEW_SEC = 30;

/**
 * Timestamp acceptance window: [now - maxAgeSec, now + YCLOUD_MAX_FUTURE_SKEW_SEC].
 * Exported so the failure classifier mirrors the same bounds.
 */
export function ycloudTimestampInWindow(
  timestampSec: number,
  maxAgeSec = MAX_SIGNATURE_AGE_SEC,
  nowSec = Date.now() / 1000,
): boolean {
  if (timestampSec > nowSec + YCLOUD_MAX_FUTURE_SKEW_SEC) return false;
  return nowSec - timestampSec <= maxAgeSec;
}

function parseSignatureHeader(header: string): {
  timestamp: string;
  signature: string;
} | null {
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const idx = p.indexOf("=");
      if (idx === -1) return [p, ""];
      return [p.slice(0, idx), p.slice(idx + 1)];
    }),
  );

  const t = parts["t"];
  const s = parts["s"];

  if (!t || !s) return null;
  return { timestamp: t, signature: s };
}

/**
 * Verifies an YCloud webhook signature over the raw body.
 * Signed payload: `${timestamp}.${rawBody}` — HMAC-SHA256 hex, compared in
 * constant time. The timestamp must fall inside the asymmetric replay window
 * BEFORE the HMAC is even computed (cheap reject for replays).
 */
export function verifyYCloudSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  maxAgeSec = MAX_SIGNATURE_AGE_SEC,
): boolean {
  if (!rawBody || !signatureHeader || !secret) return false;

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return false;

  const timestamp = Number.parseInt(parsed.timestamp, 10);
  if (Number.isNaN(timestamp)) return false;

  // Anti-replay window [now-300s, now+30s] — a symmetric Math.abs check would
  // accept future timestamps up to maxAge out, extending the replay window.
  if (!ycloudTimestampInWindow(timestamp, maxAgeSec)) return false;

  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const computed = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(parsed.signature, "hex"),
    );
  } catch {
    return false;
  }
}

/** Echo envelope types emitted by YCloud (SMB app + API sends). */
export const ECHO_EVENT_TYPES = [
  "whatsapp.message.echo",
  "whatsapp.smb.message.echoes",
] as const;

// Same candidate keys the webhook route searches for the echoed message.
const ECHO_MESSAGE_KEYS = [
  "whatsappMessage",
  "whatsappSmbMessageEcho",
  "whatsappSmbMessageEchoes",
  "smbMessage",
  "message",
  "whatsappMessageEcho",
] as const;

const EVENT_ENVELOPE_KEYS = new Set([
  "type",
  "id",
  "createTime",
  "sendTime",
  "apiVersion",
]);

const SUPPORTED_INBOUND_TYPES = new Set([
  "text",
  "image",
  "audio",
  "document",
  "video",
  "location",
  "sticker",
  "interactive",
  "reaction",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getHeader(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

function parseSignatureParts(
  header: string,
): { timestamp: string; signature: string } | null {
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const idx = p.indexOf("=");
      if (idx === -1) return [p, ""];
      return [p.slice(0, idx), p.slice(idx + 1)];
    }),
  );
  if (!parts["t"] || !parts["s"]) return null;
  return { timestamp: parts["t"], signature: parts["s"] };
}

function classifySignatureFailure(
  header: string | undefined,
  secret: string,
): string {
  if (!secret) return "missing_secret";
  if (!header) return "missing_signature_header";
  const parsed = parseSignatureParts(header);
  if (!parsed) return "malformed_signature_header";
  const timestamp = Number.parseInt(parsed.timestamp, 10);
  if (Number.isNaN(timestamp)) return "malformed_signature_header";
  // Same asymmetric window as verifyYCloudSignature: out-of-window in either
  // direction (too old OR too far in the future) reports "expired_timestamp".
  if (!ycloudTimestampInWindow(timestamp, MAX_SIGNATURE_AGE_SEC)) {
    return "expired_timestamp";
  }
  return "signature_mismatch";
}

/**
 * Mirrors the route's multi-key echo extraction. Exported for webhook
 * consumers: echo handling needs msg-level fields the normalized contract
 * can't carry (e.g. media `fileSize`), so the app-level consumer reads them
 * through this one provider-owned extraction.
 */
export function extractYCloudEchoMessage(
  event: Record<string, unknown>,
): Record<string, unknown> | undefined {
  for (const key of ECHO_MESSAGE_KEYS) {
    const candidate = event[key];
    if (isRecord(candidate)) return candidate;
  }
  for (const [key, value] of Object.entries(event)) {
    if (EVENT_ENVELOPE_KEYS.has(key)) continue;
    if (isRecord(value) && (value.to !== undefined || value.from !== undefined)) {
      return value;
    }
  }
  return undefined;
}

function normalizeType(
  msgType: unknown,
): NonNullable<NormalizedInboundEvent["type"]> {
  const t = asString(msgType);
  if (!t) return "unknown";
  return SUPPORTED_INBOUND_TYPES.has(t)
    ? (t as NonNullable<NormalizedInboundEvent["type"]>)
    : "unknown";
}

function extractMediaRefs(
  message: Record<string, unknown>,
  msgType: string,
): NormalizedInboundEvent["mediaRefs"] {
  const media = message[msgType];
  if (!isRecord(media)) return undefined;
  const ref = {
    id: asString(media.id),
    url: asString(media.link) ?? asString(media.url),
    mimeType: asString(media.mime_type) ?? asString(media.mimeType),
    filename: asString(media.file_name) ?? asString(media.filename),
  };
  return ref.id || ref.url ? [ref] : undefined;
}

function extractContextReplyId(
  message: Record<string, unknown>,
): string | undefined {
  const ctx = message.context;
  if (!isRecord(ctx)) return undefined;
  return asString(ctx.wamid) ?? asString(ctx.id);
}

function mapStatus(status: unknown): NormalizedInboundEvent["status"] {
  const s = asString(status)?.toLowerCase();
  if (s === "sent" || s === "delivered" || s === "read" || s === "failed") {
    return s;
  }
  return undefined;
}

/** Stable JSON (sorted object keys) so redelivery order can't change the hash. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Envelope keys the normalizers read, in a fixed order. */
const ENVELOPE_KEYS = [
  "whatsappInboundMessage",
  "whatsappMessage",
  "whatsappMessageUpdated",
  "whatsappSmbMessageEcho",
  "whatsappSmbMessageEchoes",
  "smbMessage",
  "whatsappMessageEcho",
  "message",
  "status",
] as const;

/**
 * Deterministic fallback when the envelope carries no event id: a stable
 * hash over every normalized envelope candidate (including the key name and
 * every field) so id-less status/lifecycle transitions with the same wamid
 * and timestamp never collapse onto one provider+delivery_id key.
 */
function syntheticDeliveryId(payload: Record<string, unknown>): string {
  const envelopes: [string, Record<string, unknown>][] = [];
  for (const key of ENVELOPE_KEYS) {
    const value = payload[key];
    if (isRecord(value)) envelopes.push([key, value]);
  }
  const basis = stableStringify({
    type: asString(payload.type) ?? null,
    time:
      asString(payload.sendTime) ??
      asString(payload.createTime) ??
      asString(payload.updateTime) ??
      null,
    envelopes,
  });
  return `ycloud:synth:${createHash("sha256").update(basis).digest("hex").slice(0, 16)}`;
}

function baseEvent(
  payload: Record<string, unknown>,
  kind: NormalizedInboundEvent["kind"],
  direction: NormalizedInboundEvent["direction"],
): NormalizedInboundEvent {
  return {
    provider: "ycloud",
    deliveryId: asString(payload.id) ?? syntheticDeliveryId(payload),
    kind,
    direction,
    providerAccountId: "",
    sender: {},
    timestamp:
      asString(payload.sendTime) ??
      asString(payload.createTime) ??
      new Date().toISOString(),
    raw: payload,
  };
}

function normalizeInbound(
  payload: Record<string, unknown>,
): NormalizedInboundEvent {
  const event = baseEvent(payload, "message.received", "inbound");
  const message = payload.whatsappInboundMessage;
  if (!isRecord(message)) {
    event.kind = "other";
    return event;
  }

  const profile = isRecord(message.customerProfile)
    ? message.customerProfile
    : undefined;
  const msgType = asString(message.type) ?? "unknown";

  event.deliveryId =
    asString(payload.id) ??
    asString(message.wamid) ??
    asString(message.id) ??
    syntheticDeliveryId(payload);
  event.providerAccountId = asString(message.wabaId) ?? "";
  // The route dedups inbound on `message.id` (wamid is the same value on
  // real YCloud payloads; kept as fallback for id-less envelopes).
  event.platformMessageId = asString(message.id) ?? asString(message.wamid);
  event.sender = {
    phone: asString(message.from),
    bsuid: asString(message.fromUserId),
    parentBsuid: asString(message.fromParentUserId),
    name: profile ? asString(profile.name) : undefined,
    username: profile ? asString(profile.username) : undefined,
  };
  event.type = normalizeType(message.type);
  event.timestamp = asString(message.sendTime) ?? event.timestamp;

  if (msgType === "text" && isRecord(message.text)) {
    event.text = asString(message.text.body);
  } else {
    const refs = extractMediaRefs(message, msgType);
    if (refs) event.mediaRefs = refs;
    const media = message[msgType];
    const caption = isRecord(media) ? asString(media.caption) : undefined;
    if (caption) event.text = caption;
  }

  const replyTo = extractContextReplyId(message);
  if (replyTo) event.replyToMessageId = replyTo;

  return event;
}

function normalizeEcho(payload: Record<string, unknown>): NormalizedInboundEvent {
  const event = baseEvent(payload, "message.echo", "outbound");
  const message = extractYCloudEchoMessage(payload);
  if (!message) return event;

  event.deliveryId =
    asString(payload.id) ??
    asString(message.wamid) ??
    asString(message.id) ??
    syntheticDeliveryId(payload);
  event.providerAccountId = asString(message.wabaId) ?? "";
  // Route echo dedup is `msg.id || event.id` — no wamid fallback in between.
  event.platformMessageId = asString(message.id) ?? asString(payload.id);
  // On echoes the business is the sender and the customer lives in `to`:
  // `to` is the conversation routing key, `from` is the bot/operator phone
  // (both with the same envelope fallbacks the route applies).
  event.providerConversationId =
    asString(message.to) ?? asString(payload.to);
  event.sender = { phone: asString(message.from) ?? asString(payload.from) };

  const msgType = asString(message.type) ?? "text";
  event.type = normalizeType(msgType);
  event.timestamp = asString(message.sendTime) ?? event.timestamp;

  if (msgType === "text" && isRecord(message.text)) {
    event.text = asString(message.text.body);
  } else {
    const refs = extractMediaRefs(message, msgType);
    if (refs) event.mediaRefs = refs;
    const media = message[msgType];
    const caption = isRecord(media) ? asString(media.caption) : undefined;
    if (caption) event.text = caption;
  }

  return event;
}

function normalizeStatus(
  payload: Record<string, unknown>,
): NormalizedInboundEvent {
  const event = baseEvent(payload, "message.status", "outbound");
  const message =
    ["whatsappMessage", "whatsappMessageUpdated", "message", "status"]
      .map((key) => payload[key])
      .find(isRecord) ?? payload;

  event.platformMessageId = asString(message.wamid) ?? asString(message.id);
  event.providerAccountId = asString(message.wabaId) ?? "";
  event.status = mapStatus(message.status);
  event.timestamp =
    asString(message.updateTime) ?? asString(message.sendTime) ?? event.timestamp;

  return event;
}

/**
 * Maps a delegated sender result to SendResult. `retryable` reports the error
 * CLASS, not remaining attempts: 4xx/validation/config errors are permanent;
 * 5xx and network errors are transient even though the sender already spent
 * its own retry budget (a later caller retry may still succeed).
 */
export function toSendResult(
  res: { ok: true; wamid?: string } | { ok: false; error: string },
): SendResult {
  if (res.ok) {
    return { ok: true, providerMessageId: res.wamid ?? "", status: "sent" };
  }
  const statusMatch = /^YCloud error (\d{3})/.exec(res.error);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;
  const retryable = res.error.startsWith("Missing ")
    ? false
    : status !== undefined
      ? status >= 500
      : true; // fetch/network/max-retries errors are transient
  return { ok: false, error: res.error, retryable };
}

/** Install-level endpoint override (`YCLOUD_BASE_URL`, no trailing slash). */
function ycloudBaseUrl(): string {
  return (
    process.env.YCLOUD_BASE_URL?.trim().replace(/\/+$/, "") ||
    DEFAULT_YCLOUD_BASE_URL
  );
}

function sendDirectlyUrl(): string {
  return `${ycloudBaseUrl()}${YCLOUD_SEND_PATH}`;
}

/**
 * Caller-resolved sendDirectly (folded client, ported from SocialCRM): a
 * single POST with the account's `from` + `apiKey`, no internal retry.
 */
async function postSendDirectly(
  apiKey: string,
  from: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; wamid?: string } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetch(sendDirectlyUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ from, ...body }),
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `YCloud request failed: ${message}` };
  }

  if (!response.ok) {
    // Status code only — the provider body may echo request data and is
    // intentionally never surfaced verbatim beyond a bounded slice.
    const error = (await response.text().catch(() => "")).slice(0, 300);
    return { ok: false, error: `YCloud error ${response.status}: ${error}` };
  }

  const result = (await response.json().catch(() => null)) as {
    id?: string;
    wamid?: string;
  } | null;
  return { ok: true, wamid: result?.id ?? result?.wamid };
}

async function sendDirectlyWithAccount(
  account: ChannelAccount,
  body: Record<string, unknown>,
): Promise<SendResult> {
  const res = await postSendDirectly(
    account.credentials.apiKey,
    account.senderAddress,
    body,
  );
  if (res.ok) {
    return { ok: true, providerMessageId: res.wamid ?? "", status: "sent" };
  }
  const statusMatch = /^YCloud error (\d{3})/.exec(res.error);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;
  return {
    ok: false,
    error: res.error,
    retryable: status === undefined ? true : status >= 500,
  };
}

/**
 * Env-resolved sendDirectly (replacement for SocialCRM's delegated
 * `src/lib/ycloud.ts` senders, which don't exist in AH). Resolves
 * `YCLOUD_API_KEY` + `WHATSAPP_PHONE_NUMBER` (+ `YCLOUD_BASE_URL`) and retries
 * on transient failures — same shape and semantics as the delegated senders:
 * 3 attempts, per-attempt timeout, retry on 5xx and network errors only.
 */
async function legacySend(
  body: Record<string, unknown>,
): Promise<{ ok: true; wamid?: string } | { ok: false; error: string }> {
  const apiKey = process.env.YCLOUD_API_KEY?.trim() ?? "";
  const from = process.env.WHATSAPP_PHONE_NUMBER?.trim() ?? "";
  if (!apiKey) return { ok: false, error: "Missing YCLOUD_API_KEY" };
  if (!from) return { ok: false, error: "Missing WHATSAPP_PHONE_NUMBER" };

  let lastError = "YCloud send failed";
  for (let attempt = 0; attempt < LEGACY_SEND_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LEGACY_SEND_TIMEOUT_MS);
    try {
      const response = await fetch(sendDirectlyUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({ from, ...body }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) {
        const result = (await response.json().catch(() => null)) as {
          id?: string;
          wamid?: string;
        } | null;
        return { ok: true, wamid: result?.id ?? result?.wamid };
      }
      const error = (await response.text().catch(() => "")).slice(0, 300);
      lastError = `YCloud error ${response.status}: ${error}`;
      // Only 5xx and network failures are worth retrying; 4xx is permanent.
      if (response.status < 500) return { ok: false, error: lastError };
    } catch (err) {
      lastError = `YCloud request failed: ${
        err instanceof Error ? err.message : String(err)
      }`;
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: lastError };
}

function accountHasCredentials(account: ChannelAccount): boolean {
  return Boolean(account.credentials.apiKey || account.senderAddress);
}

/**
 * Real account-store rows (env-materialized `env:*` ids or future DB uuids)
 * carry non-symbolic ids; placeholder (`<channel>:agent-config`) and
 * caller-resolved (`<channel>:caller-resolved`) accounts carry symbolic ids.
 * Only the symbolic ones may delegate to the install-global senders — a real
 * account must always send with its own scoped credentials.
 */
function isRealChannelAccount(account: ChannelAccount): boolean {
  return !isSymbolicAccountId(account.id);
}

/**
 * A real account with no scoped apiKey must fail closed — delegating to the
 * env-resolved senders would silently send as the install-global sender,
 * i.e. another account.
 */
function scopedCredentialsFailure(account: ChannelAccount): SendResult {
  return {
    ok: false,
    error: `channel account ${account.id} has no scoped ycloud apiKey — refusing global fallback`,
    retryable: false,
  };
}

function sendTextWithAccount(
  account: ChannelAccount,
  msg: OutboundMessage,
): Promise<SendResult> {
  return sendDirectlyWithAccount(account, {
    to: msg.to,
    type: "text",
    text: { body: msg.text },
    ...(msg.idempotencyKey ? { externalId: msg.idempotencyKey } : {}),
  });
}

function sendImageWithAccount(
  account: ChannelAccount,
  msg: OutboundMessage,
): Promise<SendResult> {
  return sendDirectlyWithAccount(account, {
    to: msg.to,
    type: "image",
    image: { link: msg.mediaUrl, caption: msg.text || "" },
    ...(msg.idempotencyKey ? { externalId: msg.idempotencyKey } : {}),
  });
}

function sendDocumentWithAccount(
  account: ChannelAccount,
  msg: OutboundMessage,
): Promise<SendResult> {
  return sendDirectlyWithAccount(account, {
    to: msg.to,
    type: "document",
    document: {
      link: msg.mediaUrl,
      caption: msg.text || "",
      filename: "documento.pdf",
    },
    ...(msg.idempotencyKey ? { externalId: msg.idempotencyKey } : {}),
  });
}

export const ycloudProvider: MessagingProvider = {
  id: "ycloud",
  signatureScheme: "timestamped-hmac",

  verifyWebhook({ headers, rawBody, secret }) {
    const header = getHeader(headers, SIGNATURE_HEADER) ?? "";
    if (!verifyYCloudSignature(rawBody, header, secret)) {
      return { ok: false, reason: classifySignatureFailure(header, secret) };
    }
    return { ok: true };
  },

  parseWebhook({ rawBody }) {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return [];
    }
    if (!isRecord(payload)) return [];

    const type = asString(payload.type);
    if (type === INBOUND_EVENT_TYPE) return [normalizeInbound(payload)];
    if ((ECHO_EVENT_TYPES as readonly string[]).includes(type ?? "")) {
      return [normalizeEcho(payload)];
    }
    if (type === STATUS_EVENT_TYPE) return [normalizeStatus(payload)];
    return [baseEvent(payload, "other", "na")];
  },

  // `account` only steers credential selection in v1: when it carries a
  // caller-resolved apiKey/sender, sends go through the folded direct client
  // above; otherwise the env-resolved senders apply (YCLOUD_API_KEY +
  // WHATSAPP_PHONE_NUMBER) until `channel_accounts` lands.
  //
  // Real account rows (non-symbolic id) are the exception: they must ALWAYS
  // send with their own scoped apiKey. An empty scoped key is a hard failure
  // — never a delegation to the install-global senders.
  async sendMessage(account, msg) {
    if (isRealChannelAccount(account) && !account.credentials.apiKey) {
      return scopedCredentialsFailure(account);
    }
    const externalId = msg.idempotencyKey; // → ycloud externalId
    switch (msg.type) {
      case "text": {
        if (!msg.text) {
          return {
            ok: false,
            error: "text message requires msg.text",
            retryable: false,
          };
        }
        // Caller-resolved credentials (real account rows): the account
        // carries them, so send with exactly those — the env senders would
        // re-resolve differently.
        if (accountHasCredentials(account)) {
          return sendTextWithAccount(account, msg);
        }
        return toSendResult(
          await legacySend({ to: msg.to, type: "text", text: { body: msg.text } }),
        );
      }
      case "image": {
        if (!msg.mediaUrl) {
          return {
            ok: false,
            error: "image message requires msg.mediaUrl",
            retryable: false,
          };
        }
        if (accountHasCredentials(account)) {
          return sendImageWithAccount(account, msg);
        }
        return toSendResult(
          await legacySend({
            to: msg.to,
            type: "image",
            image: { link: msg.mediaUrl, caption: msg.text || "" },
            ...(externalId ? { externalId } : {}),
          }),
        );
      }
      case "document": {
        if (!msg.mediaUrl) {
          return {
            ok: false,
            error: "document message requires msg.mediaUrl",
            retryable: false,
          };
        }
        if (accountHasCredentials(account)) {
          return sendDocumentWithAccount(account, msg);
        }
        return toSendResult(
          await legacySend({
            to: msg.to,
            type: "document",
            document: {
              link: msg.mediaUrl,
              caption: msg.text || "",
              filename: "documento.pdf",
            },
            ...(externalId ? { externalId } : {}),
          }),
        );
      }
      default:
        return {
          ok: false,
          error: `ycloud adapter does not support outbound type '${msg.type}' yet`,
          retryable: false,
        };
    }
  },

  async resolveMedia(account, ref) {
    if (ref.url && !ref.id) {
      // Allowlist enforcement stays downstream in the media downloader.
      return { url: ref.url };
    }
    if (!ref.id) {
      throw new Error("resolveMedia requires ref.id or ref.url");
    }
    const apiKey = account.credentials.apiKey;
    if (!apiKey) {
      throw new Error("resolveMedia requires account.credentials.apiKey");
    }

    // Same metadata request as downloadYCloudMedia step 1.
    const metaResp = await fetch(
      `${ycloudBaseUrl()}/v2/whatsapp/media/${ref.id}`,
      {
        headers: { "X-API-Key": apiKey },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!metaResp.ok) {
      throw new Error(`YCloud media metadata failed: ${metaResp.status}`);
    }
    const meta = (await metaResp.json()) as {
      url?: string;
      mime_type?: string;
      file_name?: string;
    };
    if (!meta.url) throw new Error("No media URL returned by YCloud");
    return {
      url: meta.url,
      mimeType: meta.mime_type,
      filename: meta.file_name,
    };
  },
};
