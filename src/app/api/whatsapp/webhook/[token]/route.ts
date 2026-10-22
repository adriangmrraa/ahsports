import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import "@/lib/whatsapp/register";

import { deriveWebhookPathToken, timingSafeEqualString } from "@/lib/channels/telegram";
import { verifyWhatsAppSignature, whatsappSignatureHeader } from "@/lib/channels/signature";
import { whatsAppWebhookSchema, type WhatsAppMessage } from "@/lib/channels/whatsapp/import";
import { checkRateLimit, clientIpFromRequest } from "@/lib/infra/rate-limit";
import { readBoundedBody } from "@/lib/infra/webhook-guard";
import { MAX_WEBHOOK_EVENTS } from "@/lib/infra/webhook-guard";
import { ChannelAccountResolutionError } from "@/lib/messaging/accounts";
import { handleNormalizedEvent } from "@/lib/messaging/inbound-pipeline";
import { resolveIngressContext } from "@/lib/messaging/ingress";
import { providerForChannel } from "@/lib/messaging/registry";
import { aggregateWebhookStatuses } from "@/lib/messaging/webhook-response";
import type { NormalizedInboundEvent } from "@/lib/messaging/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp Business (Cloud API) webhook — Meta envelope, thin delegate.
 *
 * This route ONLY unwraps Meta's entry/changes/value envelope into
 * NormalizedInboundEvents and feeds the shared wave-1 inbound pipeline
 * (`handleNormalizedEvent`) — no parallel import/routing/send path (the
 * SocialCRM S12/S15 pattern). Signature verification stays Meta-specific
 * (`X-Hub-Signature-256` over the raw body, constant time) because unified
 * ingress signs per provider adapter; account resolution, dedup, debounce
 * and the agent dispatch seam all live downstream.
 *
 * Importing `@/lib/whatsapp/register` installs the sales dispatcher on the
 * pipeline for every whatsapp turn this route produces.
 *
 * GET  — Meta verification handshake (unified ingress has no GET).
 * POST — path token → per-IP rate limit → bounded body → signature → zod
 *        envelope → per-event account resolution → pipeline.
 *
 * Missing config → 503 · bad token/signature → 403 · oversized → 413 ·
 * bad payload → 400 · transient downstream failure → 503 (Meta retries).
 * Secrets and raw bodies are never logged.
 */

const WA_RATE_LIMIT = 120;
const WA_RATE_BUCKET = 600;

function whatsAppConfig(): { appSecret: string; verifyToken: string } | null {
  const appSecret = process.env.WHATSAPP_APP_SECRET ?? "";
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  if (!appSecret || !verifyToken) return null;
  return { appSecret, verifyToken };
}

function pathTokenMatches(token: string, verifyToken: string): boolean {
  return timingSafeEqualString(token, deriveWebhookPathToken(verifyToken));
}

// ─── Meta envelope → NormalizedInboundEvent ──────────────────────────────────

type MetaValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: WhatsAppMessage[];
  smb_message_echoes?: WhatsAppMessage[];
  statuses?: { id?: string; status?: string; timestamp?: string; recipient_id?: string }[];
};

type EventType = NonNullable<NormalizedInboundEvent["type"]>;

function mapMessageType(type: string | undefined): EventType {
  switch (type) {
    case "text":
    case "image":
    case "audio":
    case "video":
    case "document":
    case "location":
    case "interactive":
    case "reaction":
      return type;
    default:
      return "unknown";
  }
}

function textFor(message: WhatsAppMessage): string {
  if (message.text?.body) return message.text.body;
  if (message.image?.caption) return message.image.caption;
  if (message.image) return "[image]";
  if (message.document?.caption) return message.document.caption;
  if (message.document?.filename) return message.document.filename;
  if (message.document) return "[document]";
  if (message.template?.name) return `[template: ${message.template.name}]`;
  return "";
}

function mediaRefsFor(message: WhatsAppMessage): NormalizedInboundEvent["mediaRefs"] {
  const media = message.image ?? message.document;
  if (!media?.id) return undefined;
  return [{ id: media.id, mimeType: media.mime_type }];
}

/**
 * Deterministic delivery id — Meta carries no event id, so the dedup anchor
 * is synthesized from kind + platform message id (or a body hash for id-less
 * status rows). Never empty.
 */
function metaDeliveryId(kind: string, key: string | undefined, seed: unknown): string {
  if (key) return `meta:${kind}:${key}`;
  const hash = createHash("sha256").update(JSON.stringify(seed)).digest("hex").slice(0, 24);
  return `meta:${kind}:synth:${hash}`;
}

function contactNameFor(value: MetaValue, waId: string | undefined): string | undefined {
  if (!waId) return undefined;
  return value.contacts?.find((contact) => contact.wa_id === waId)?.profile?.name;
}

function metaMessageToEvent(
  message: WhatsAppMessage,
  value: MetaValue,
  kind: "message.received" | "message.echo"
): NormalizedInboundEvent {
  const isEcho = kind === "message.echo";
  const routingKey =
    value.metadata?.phone_number_id ?? value.metadata?.display_phone_number ?? "";
  return {
    provider: "ycloud", // whatsapp routing is ycloud-bound in v1
    deliveryId: metaDeliveryId(isEcho ? "echo" : "inbound", message.id, message),
    kind,
    direction: isEcho ? "outbound" : "inbound",
    providerAccountId: routingKey,
    // Inbound: the provider thread is the customer wa_id. Echo: `to` is the
    // customer (the pipeline keys echo conversations off it).
    providerConversationId: isEcho ? message.to : message.from,
    providerThreadId: isEcho ? message.to : message.from,
    platformMessageId: message.id,
    sender: isEcho
      ? { phone: message.from ?? routingKey }
      : { phone: message.from, name: contactNameFor(value, message.from) },
    type: mapMessageType(message.type),
    text: textFor(message),
    mediaRefs: mediaRefsFor(message),
    raw: {
      // ycloud-shaped envelope: the pipeline's protocol-artifact and
      // echo-extraction guards key off these field names.
      type: isEcho
        ? "whatsapp.smb.message.echoes"
        : "whatsapp.inbound_message.received",
      channel: "whatsapp",
      ...(isEcho
        ? { whatsappMessage: message }
        : { whatsappInboundMessage: message }),
    },
  };
}

function metaStatusToEvent(
  status: NonNullable<MetaValue["statuses"]>[number],
  value: MetaValue
): NormalizedInboundEvent {
  const routingKey =
    value.metadata?.phone_number_id ?? value.metadata?.display_phone_number ?? "";
  return {
    provider: "ycloud",
    deliveryId: metaDeliveryId("status", status.id, status),
    kind: "message.status",
    direction: "na",
    providerAccountId: routingKey,
    providerConversationId: status.recipient_id,
    platformMessageId: status.id,
    sender: { phone: status.recipient_id ?? routingKey },
    type: "unknown",
    raw: { type: "whatsapp.message.status", channel: "whatsapp", status },
  };
}

/** Meta envelope → normalized events, preserving provider order. */
export function metaEnvelopeToEvents(payload: unknown): NormalizedInboundEvent[] {
  const parsed = whatsAppWebhookSchema.safeParse(payload);
  if (!parsed.success) return [];

  const events: NormalizedInboundEvent[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const value = change.value as MetaValue;
      for (const message of value.messages ?? []) {
        events.push(metaMessageToEvent(message, value, "message.received"));
      }
      for (const echo of value.smb_message_echoes ?? []) {
        events.push(metaMessageToEvent(echo, value, "message.echo"));
      }
      for (const status of value.statuses ?? []) {
        events.push(metaStatusToEvent(status, value));
      }
    }
  }
  return events;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const config = whatsAppConfig();
  if (!config) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const presentedToken = url.searchParams.get("hub.verify_token") ?? "";

  const authorized =
    mode === "subscribe" &&
    timingSafeEqualString(presentedToken, config.verifyToken) &&
    pathTokenMatches(token, config.verifyToken);

  if (!authorized) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const config = whatsAppConfig();
  if (!config) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  if (!pathTokenMatches(token, config.verifyToken)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const provider = providerForChannel("whatsapp");
  if (!provider) {
    return NextResponse.json({ ok: false, error: "no_provider" }, { status: 503 });
  }

  // Bound unauthenticated work before buffering: per-IP limit, then the
  // declared/actual size guard (F8) — same shape as unified ingress.
  const rate = await checkRateLimit(`webhook:whatsapp:${clientIpFromRequest(request)}`, {
    bucket: "webhook:whatsapp",
    limit: WA_RATE_LIMIT,
    bucketLimit: WA_RATE_BUCKET,
  });
  if (!rate.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const bounded = await readBoundedBody(request);
  if (!bounded.ok) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const rawBody = bounded.rawBody;

  // The signature is over the exact bytes received: verify, then parse.
  const signatureOk = verifyWhatsAppSignature({
    appSecret: config.appSecret,
    rawBody,
    header: whatsappSignatureHeader(request),
  });
  if (!signatureOk) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  // Non-whatsapp objects ack without work — Meta verifies the endpoint with
  // other object types during setup.
  if (
    typeof json !== "object" ||
    json === null ||
    (json as { object?: string }).object !== "whatsapp_business_account"
  ) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const parsed = whatsAppWebhookSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const events = metaEnvelopeToEvents(parsed.data);
  if (events.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 }, { status: 200 });
  }

  const capped = events.slice(0, MAX_WEBHOOK_EVENTS);
  if (capped.length < events.length) {
    console.warn(
      `[whatsapp/webhook] envelope carried ${events.length} events — capped at ${MAX_WEBHOOK_EVENTS}`
    );
  }

  const statuses: number[] = [];
  for (const event of capped) {
    let ctx;
    try {
      ctx = await resolveIngressContext(provider, event);
    } catch (error) {
      // Verified signature but account resolution is down — retryable so
      // Meta redelivers instead of silently dropping the turn.
      if (error instanceof ChannelAccountResolutionError) {
        return NextResponse.json({ error: "account-resolution-failed" }, { status: 503 });
      }
      throw error;
    }
    if (!ctx) continue; // fail-closed — reason already logged in resolution
    const response = await handleNormalizedEvent(event, ctx);
    statuses.push(response.status);
  }

  const aggregate = aggregateWebhookStatuses(statuses);
  return NextResponse.json(
    { ok: aggregate.ok, processed: statuses.length },
    { status: aggregate.status }
  );
}
