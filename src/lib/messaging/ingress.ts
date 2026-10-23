import "server-only";

import { NextResponse } from "next/server";

import {
  importOperatorOutbound,
  persistAgentOutbound,
  persistCanonicalMessage,
} from "@/lib/channels/intake";
import { MAX_WEBHOOK_EVENTS } from "@/lib/infra/webhook-guard";

import {
  ChannelAccountResolutionError,
  channelAccountRowId,
  resolveChannelAccount,
  resolveChannelAccountStrict,
} from "./accounts";
import {
  persistChannelEvent,
  releaseChannelDeliveryMarker,
} from "./channel-events";
import { canonicalExternalUserId } from "./conversation-identity";
import { classifyError } from "./errors";
import { isMessageDuplicate } from "./inbound-pipeline";
import { ensureLeadIdentity } from "./lead-identity";
import { channelForProvider, isChannelKind } from "./registry";
import type {
  ChannelAccount,
  ChannelKind,
  MessagingProvider,
  NormalizedInboundEvent,
  ProviderId,
} from "./types";

/**
 * Webhook ingress seam — provider-agnostic glue between
 * `POST /api/webhooks/ingress/[provider]` and the shared inbound pipeline.
 * Port of SocialCRM `src/lib/messaging/ingress.ts`, adapted for AH:
 *
 * - resolveWebhookSecret: per-provider secret resolves from
 *   `<PROVIDER>_WEBHOOK_SECRET` in env — AH has no agent_config credential
 *   columns, so env is the single-account secret source for every provider.
 * - resolveEventChannel / eventSelfAddresses / resolveIngressContext:
 *   verbatim semantics — raw `channel`/`platform` hint wins, else the
 *   registry inversion; per-event strict account resolution over the
 *   provider routing key + business self-addresses, fail-closed.
 * - handlePassiveChannelEvent: channels the agent pipeline can't consume
 *   (everything except whatsapp/telegram, plus non-message kinds) get
 *   durable persistence: a channel_events-equivalent marker in
 *   `idempotency_keys` always; a canonical conversation+message through
 *   `persistCanonicalMessage` when the channel is in the persistence set
 *   (whatsapp|telegram|instagram|facebook). Channels outside the set
 *   (sms/reddit — no verified provider normalization yet) get marker + ack.
 * - The delivery marker claim → persist → release-on-failure protocol is
 *   unchanged: claim before any write so concurrent redeliveries can't both
 *   pass the dedup read, release on failure so retries aren't permanently
 *   skipped.
 */

/** Context threaded through the inbound pipeline for account-aware stamping. */
export interface IngressContext {
  channel: ChannelKind;
  account: ChannelAccount;
  /** channel_accounts row id — undefined for env-materialized accounts. */
  channelAccountId?: string;
}

/**
 * Webhook secret per provider: `<PROVIDER>_WEBHOOK_SECRET` from env for every
 * provider (ycloud/kapso/zernio). Empty string = caller must 401 — a missing
 * secret fails closed, never a skipped signature check.
 */
export async function resolveWebhookSecret(provider: ProviderId): Promise<string> {
  return process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`] ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Per-account signature verification (F7). One install-wide provider secret
 * alone lets a secret holder forge events naming ANOTHER provisioned account
 * — a cross-account injection inside the same provider. The envelope is
 * parsed and each event's channel account resolved BEFORE processing, so the
 * signature is checked against the secret the named account actually owns:
 * an event bound to a real account with its own `credentials.webhookSecret`
 * is processed only when THAT secret verifies; events resolving to the
 * secret-less legacy placeholder (or no account at all) keep the
 * install-wide provider secret as their expected signer. Nothing is
 * processed while unresolved — a resolution failure propagates so the route
 * stays retryable, never an acked drop.
 */
export type VerifiedIngress =
  | { kind: "unauthorized" }
  /** Signature verified but the body parses to no events (see route contract). */
  | { kind: "empty" }
  | {
      kind: "ok";
      events: { event: NormalizedInboundEvent; ctx: IngressContext | undefined }[];
      /** Events dropped because no secret they may be signed with verified. */
      rejected: number;
    };

export async function verifyAndResolveEvents(
  provider: MessagingProvider,
  input: { headers: Record<string, string>; rawBody: string }
): Promise<VerifiedIngress> {
  const providerSecret = await resolveWebhookSecret(provider.id);
  const providerVerified =
    providerSecret.length > 0 &&
    provider.verifyWebhook({ ...input, secret: providerSecret }).ok;

  const parsed = provider.parseWebhook(input);
  if (parsed.length === 0) {
    return providerVerified ? { kind: "empty" } : { kind: "unauthorized" };
  }

  // Cap BEFORE resolution — each event's account lookup costs a query, so an
  // over-stuffed envelope must not fan out into unbounded work (F8).
  // Excess events are dropped with a warning: re-delivering the same signed
  // envelope can't save them, so the route still acks.
  const events = parsed.slice(0, MAX_WEBHOOK_EVENTS);
  if (events.length < parsed.length) {
    console.warn(
      `[ingress] ${provider.id} envelope carried ${parsed.length} events — ` +
        `capped at ${MAX_WEBHOOK_EVENTS}`
    );
  }

  // Expected signer per event: the account's own webhook secret when the
  // account carries one, else the provider-level secret.
  const expectedSecret = (ctx: IngressContext | undefined): string =>
    ctx?.account.credentials.webhookSecret || providerSecret;

  const resolved: { event: NormalizedInboundEvent; ctx: IngressContext | undefined }[] = [];
  try {
    for (const event of events) {
      resolved.push({
        event,
        ctx: await resolveIngressContext(provider, event),
      });
    }
  } catch (error) {
    // Verified provider signature but account resolution is down → retryable
    // (drop nothing). An UNVERIFIED signature whose account secrets can't be
    // enumerated is simply unauthenticated junk — reject it instead of
    // paying a retryable response for traffic that was never signed.
    if (
      error instanceof ChannelAccountResolutionError &&
      !providerVerified
    ) {
      return { kind: "unauthorized" };
    }
    throw error;
  }

  const verified = new Set<string>();
  if (providerVerified) verified.add(providerSecret);
  for (const secret of new Set(resolved.map((r) => expectedSecret(r.ctx)))) {
    if (secret && !verified.has(secret)) {
      if (provider.verifyWebhook({ ...input, secret }).ok) verified.add(secret);
    }
  }

  const accepted = resolved.filter((r) => verified.has(expectedSecret(r.ctx)));
  if (accepted.length === 0) return { kind: "unauthorized" };

  const rejected = resolved.length - accepted.length;
  if (rejected > 0) {
    console.warn(
      `[ingress] ${provider.id} — dropped ${rejected}/${resolved.length} events: ` +
        `no verified secret covers the account they name (cross-account forgery guard)`
    );
  }
  return { kind: "ok", events: accepted, rejected };
}

/**
 * Channel for an inbound event: explicit adapter hint on `raw.channel` /
 * `raw.platform` wins; otherwise the channel routed to this provider in the
 * registry. Returns undefined when neither source names a channel.
 */
export function resolveEventChannel(
  provider: MessagingProvider,
  event: NormalizedInboundEvent
): ChannelKind | undefined {
  const raw = isRecord(event.raw) ? event.raw : undefined;
  const hint =
    asNonEmptyString(raw?.channel) ?? asNonEmptyString(raw?.platform);
  if (hint && isChannelKind(hint)) return hint;
  return channelForProvider(provider.id);
}

/**
 * Candidate business-side routing keys for account resolution, after the
 * event's own `providerAccountId`.
 *
 * Direction is load-bearing: on inbound events `to` is the business number;
 * on echoes/status events `to` is the CUSTOMER and only `from` (plus the
 * normalized `sender.phone`) may identify the business. A customer address
 * must never become an account-resolution candidate.
 */
export function eventSelfAddresses(event: NormalizedInboundEvent): string[] {
  const out: string[] = [];
  if (event.direction === "outbound" && event.sender.phone) {
    out.push(event.sender.phone);
  }
  const raw = isRecord(event.raw) ? event.raw : undefined;
  const outbound = event.direction === "outbound";
  for (const key of [
    "whatsappInboundMessage",
    "whatsappMessage",
    "whatsappMessageUpdated",
    "message",
    "status",
  ]) {
    const node = raw?.[key];
    if (!isRecord(node)) continue;
    if (outbound) {
      const from = asNonEmptyString(node.from);
      if (from) out.push(from);
    } else {
      const to = asNonEmptyString(node.to);
      if (to) out.push(to);
    }
  }
  return [...new Set(out)];
}

/**
 * Resolve the channel + channel account an event belongs to. Returns
 * undefined when the channel can't be derived or no account matches on a
 * provisioned channel (fail-closed: log + caller acks and skips).
 */
export async function resolveIngressContext(
  provider: MessagingProvider,
  event: NormalizedInboundEvent
): Promise<IngressContext | undefined> {
  const channel = resolveEventChannel(provider, event);
  if (!channel) {
    console.warn(
      `[ingress] ${provider.id} event ${event.deliveryId} skipped — ` +
        `cannot derive channel (kind=${event.kind})`
    );
    return undefined;
  }

  const keys = [
    event.providerAccountId,
    ...eventSelfAddresses(event),
  ].filter((k): k is string => typeof k === "string" && k.length > 0);

  const resolution = await resolveChannelAccountStrict(
    channel,
    keys,
    provider.id
  );

  if (resolution.kind === "db-error") {
    // Retryable: the route/pipeline maps this to 503, never a silent ack.
    throw new ChannelAccountResolutionError(resolution);
  }
  if (resolution.kind === "not-found" || resolution.kind === "mismatch") {
    console.warn(
      `[ingress] ${provider.id}/${channel} event ${event.deliveryId} skipped — ` +
        `${
          resolution.kind === "mismatch"
            ? resolution.reason
            : `no channel account row matches providerAccountId=${event.providerAccountId || "n/a"}`
        }; fail-closed`
    );
    return undefined;
  }

  // resolved → the matched row. unprovisioned/schema-not-ready → the
  // secret-less legacy placeholder, which exists only for ycloud installs.
  // Non-ycloud providers have no legacy installs to protect — they take the
  // same fail-closed skip as not-found/mismatch.
  if (resolution.kind !== "resolved" && provider.id !== "ycloud") {
    console.warn(
      `[ingress] ${provider.id}/${channel} event ${event.deliveryId} skipped — ` +
        `channel accounts ${resolution.kind}; legacy fallback is ycloud-only — fail-closed`
    );
    return undefined;
  }

  const account =
    resolution.kind === "resolved"
      ? resolution.account
      : await resolveChannelAccount(channel, undefined, provider.id);
  if (!account) {
    console.warn(
      `[ingress] ${provider.id}/${channel} event ${event.deliveryId} skipped — ` +
        `no registered provider for channel '${channel}'`
    );
    return undefined;
  }

  return {
    channel,
    account,
    channelAccountId: channelAccountRowId(account),
  };
}

/**
 * Structured ack log for events that are accepted but have no persistence
 * target (protocol artifacts, unsupported kinds, unresolvable account
 * identities). Status/lifecycle kinds DO have a target — they persist via
 * persistChannelEvent before reaching here.
 */
export function logAckedWithoutPersistence(
  event: NormalizedInboundEvent,
  reason?: string
): void {
  console.log(
    `[ingress] ${event.provider} kind=${event.kind} deliveryId=${event.deliveryId}` +
      ` platformMessageId=${event.platformMessageId ?? "n/a"} — acknowledged without persistence` +
      (reason ? ` (${reason})` : "")
  );
}

/**
 * Identity key for passive persistence. Echoes carry the BUSINESS in
 * `sender.phone` and the CUSTOMER in `providerConversationId` — keying an echo
 * by the business number would merge every customer into one conversation.
 */
export function eventConversationExternalUserId(
  event: NormalizedInboundEvent
): string | undefined {
  if (event.kind === "message.echo") {
    return (
      event.providerConversationId ??
      event.sender.socialId ??
      event.sender.bsuid ??
      event.sender.username
    );
  }
  return (
    event.sender.phone ??
    event.sender.socialId ??
    event.sender.bsuid ??
    event.sender.username ??
    event.providerConversationId
  );
}

const PASSIVE_PERSISTED_KINDS = new Set<NormalizedInboundEvent["kind"]>([
  "message.received",
  "message.echo",
  "comment.received",
]);

/** Channels that persist a canonical conversation + message passively.
 *  instagram/facebook events resolve conversations through the same
 *  channel-agnostic intake; sms/reddit stay marker-only until a provider
 *  emits them with verifiable normalization. */
const PERSISTABLE_CHANNELS = new Set<ChannelKind>([
  "whatsapp",
  "telegram",
  "instagram",
  "facebook",
]);

/**
 * Persisted sender kind for passive message kinds. Echoes are
 * operator-authored unless the adapter stamped `raw.echoOrigin === "api"` —
 * the normalized hint for API/agent-authored sends (kapso `cloud_api`) —
 * which maps to "agent". Inbound/comments are "customer".
 */
function passiveSenderKind(
  event: NormalizedInboundEvent
): "customer" | "agent" | "operator" {
  if (event.kind === "message.echo") {
    const raw = isRecord(event.raw) ? event.raw : undefined;
    return asNonEmptyString(raw?.echoOrigin) === "api" ? "agent" : "operator";
  }
  return "customer";
}

function passiveContentType(
  event: NormalizedInboundEvent
): "text" | "image" | "document" | "system" {
  if (event.type === "image") return "image";
  if (event.type === "document") return "document";
  return "text";
}

/**
 * Passive persistence for inbound events on channels the agent pipeline
 * doesn't consume: claim the delivery marker BEFORE any write (idempotency
 * key = the claim itself), dedup on platformMessageId, then persist through
 * canonical intake. A failed persistence releases the claim so the
 * provider's redelivery can retry. No agent run — agent dispatch for
 * non-whatsapp channels waits for a provider-generalized dispatcher.
 * Never throws for expected cases: every handled event acknowledges 200;
 * transient persistence failures return 503 so providers retry.
 */
export async function handlePassiveChannelEvent(
  event: NormalizedInboundEvent,
  ctx: IngressContext
): Promise<NextResponse> {
  let deliveryClaimed = false;
  try {
    if (!PASSIVE_PERSISTED_KINDS.has(event.kind)) {
      await persistChannelEvent(event, {
        channel: ctx.channel,
        account: ctx.account,
        channelAccountId: ctx.channelAccountId,
      });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const externalUserId = eventConversationExternalUserId(event);
    if (!externalUserId) {
      logAckedWithoutPersistence(event, "no sender identity to key a conversation");
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const marker = await persistChannelEvent(event, {
      channel: ctx.channel,
      account: ctx.account,
      channelAccountId: ctx.channelAccountId,
    });
    if (marker.kind === "duplicate") {
      console.log(
        `[ingress] duplicate delivery ${event.provider}:${event.deliveryId} on ${ctx.channel} — skipping`
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    deliveryClaimed = marker.kind === "persisted";

    // Channels outside the persistence set keep only the durable marker.
    if (!PERSISTABLE_CHANNELS.has(ctx.channel)) {
      logAckedWithoutPersistence(
        event,
        `channel '${ctx.channel}' not in persistence set`
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    const channel = ctx.channel;

    const platformMessageId = event.platformMessageId;
    if (!platformMessageId) {
      logAckedWithoutPersistence(
        event,
        "no platformMessageId — cannot anchor durable dedup"
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    if (await isMessageDuplicate(channel, platformMessageId)) {
      console.log(
        `[ingress] duplicate ${event.kind} ${platformMessageId} on ${channel} — skipping`
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const externalThreadId = canonicalExternalUserId(channel, externalUserId);
    const text = event.text?.trim() || `[${event.type ?? event.kind}]`;
    const content =
      event.kind === "comment.received" ? `[Comentario]: ${text}` : text;

    const persist =
      event.kind === "message.echo"
        ? passiveSenderKind(event) === "agent"
          ? persistAgentOutbound
          : importOperatorOutbound
        : persistCanonicalMessage;
    const outcome = await persist({
      channel,
      externalThreadId,
      platformMessageId,
      ...(event.direction === "outbound" && event.kind !== "message.echo"
        ? { direction: "outbound" as const, senderKind: "operator" as const }
        : {}),
      senderRef: event.sender.phone ?? event.sender.username ?? undefined,
      contentType: passiveContentType(event),
      content,
      rawPayload: {
        provider: event.provider,
        deliveryId: event.deliveryId,
        providerAccountId: event.providerAccountId,
        providerConversationId: event.providerConversationId,
        providerThreadId: event.providerThreadId,
        mediaRefs: event.mediaRefs,
        raw: event.raw,
      },
    });

    if (!outcome.ok) {
      if (outcome.error === "persistence_failed") {
        if (deliveryClaimed) {
          await releaseChannelDeliveryMarker(
            event.provider,
            event.deliveryId,
            ctx.channelAccountId ?? null
          );
          deliveryClaimed = false;
        }
        return NextResponse.json(
          { error: "event-persistence-failed" },
          { status: 503 }
        );
      }
      console.warn(
        `[ingress] ${event.provider} ${event.deliveryId} rejected by canonical intake`,
        outcome.issues
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (!outcome.duplicate && event.kind !== "message.echo") {
      await ensureLeadIdentity({
        channel,
        externalUserId,
        externalUserIdNormalized: externalThreadId,
        customerName: event.sender.name ?? event.sender.username ?? null,
        customerPhone: event.sender.phone ?? null,
        channelAccountId: ctx.channelAccountId ?? null,
        conversationId: outcome.conversationId,
      });
    }

    console.log(
      outcome.duplicate
        ? `[ingress] duplicate ${event.kind} ${platformMessageId} — already persisted`
        : `[ingress] persisted ${event.kind} on ${channel} conv=${outcome.conversationId} account=${ctx.account.id}`
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    // Transient persistence failures must be retried, not acked/dropped.
    if (deliveryClaimed) {
      await releaseChannelDeliveryMarker(
        event.provider,
        event.deliveryId,
        ctx.channelAccountId ?? null
      );
    }
    console.error(
      `[ingress] ${event.provider} kind=${event.kind} deliveryId=${event.deliveryId} — persistence failed`,
      error
    );
    return NextResponse.json(
      { error: "event-persistence-failed" },
      { status: classifyError(error) === "retryable-db" ? 503 : 500 }
    );
  }
}
