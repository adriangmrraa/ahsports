import "server-only";

import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { and, desc, eq, gt } from "drizzle-orm";

import { db } from "@/db/client";
import { chatMessages } from "@/db/schema";
import {
  importOperatorOutbound,
  persistAgentOutbound,
  persistCustomerInbound,
  updateMessageDelivery,
} from "@/lib/channels/intake";
import {
  routeInboundMessage,
  type PersistedInbound,
} from "@/lib/channels/router";
import type { NormalizedMessage } from "@/lib/channels/types";
import { checkRateLimit } from "@/lib/infra/rate-limit";

import { channelAccountRowId, matchSenderToChannelAccount } from "./accounts";
import {
  resolveAgentConfigStrict,
  resolveScopeForConversation,
} from "@/lib/channels/agent-config-scope";
import { autoReplyClaimKey, shouldSendAutoReply } from "./auto-reply";
import {
  BufferManager,
  scheduleBufferProcessing,
  type BufferedMessage,
} from "./buffer";
import { matchesAssistantBubble } from "./bubbles";
import {
  persistChannelEvent,
  releaseChannelDeliveryMarker,
} from "./channel-events";
import {
  canonicalExternalUserId,
  ConversationIdentityError,
  drizzleConversationIdentityRepository,
  resolveConversationIdentity,
} from "./conversation-identity";
import { classifyError } from "./errors";
import { accountScopedInboundKey } from "./inbound-keys";
import { ensureLeadIdentity } from "./lead-identity";
import { messenger } from "./messenger";
import { isProtocolArtifact } from "./protocol";
import type {
  ChannelAccount,
  ChannelKind,
  NormalizedInboundEvent,
} from "./types";

/**
 * Shared inbound pipeline (port of SocialCRM `inbound-pipeline.ts`, transport
 * slice only).
 *
 * Handles normalized events on channels the AH agent layer can consume
 * (`whatsapp`, `telegram` — the persistable channel enum). Everything SocialCRM
 * bolted on top and AH lacks is intentionally NOT here: the session boundary
 * machine, seller/delivery routing, `agent_config` credentials, media download
 * + transcription (wave 2), order redirects, and `humanOverrideUntil` (no such
 * column). The transports kept, unchanged in spirit:
 *
 * - echo attribution: the business-side sender must resolve to a provisioned
 *   account before an echo may touch a conversation (no foreign echo binds);
 * - dedup in the right order: delivery marker → platformMessageId →
 *   level-2 content hash (5s window inside the buffer);
 * - own-bubble echo suppression: echoes matching a recent agent reply bubble
 *   are recognized by CONTENT because multi-bubble sends split one persisted
 *   reply into N provider ids;
 * - operator-activity gate: a recent operator-authored outbound (a human
 *   answering from WhatsApp Business / the admin) suppresses the AI turn —
 *   the fact-based substitute for SocialCRM's `humanOverrideUntil` column;
 * - short-debounce batching before dispatch: bursts produce ONE agent turn;
 * - a swappable `InboundTurnDispatcher` — default runs AH's canonical
 *   `routeInboundMessage` and delivers the reply through `messenger`;
 * - retryable persistence failures map to 503, never a silent ack.
 */

/**
 * Per-event context handed to the pipeline by the unified ingress route.
 * `channelAccountId` is the store-row id of the resolved account — undefined
 * for env-materialized accounts, which keep the legacy null partition.
 */
export interface InboundContext {
  channel?: ChannelKind;
  account?: ChannelAccount;
  channelAccountId?: string;
}

/** Operator send-out window that suppresses an AI turn (human is handling). */
const OPERATOR_ACTIVE_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Own-echo bubble comparison looks back this far for a recent agent reply. */
const OWN_ECHO_LOOKBACK_MS = 30_000;

/** Inbound bursts per (channel, sender) above this get 429 → provider retry. */
const INBOUND_RATE_LIMIT = 30;

// ─── Local reads ────────────────────────────────────────────────────────────

/**
 * Dedup anchor: an existing canonical message with this (channel,
 * platformMessageId). The unique index makes the same check race-safe inside
 * intake; this pre-check skips the transaction entirely on replay.
 */
export async function isMessageDuplicate(
  channel: "whatsapp" | "telegram",
  platformMessageId: string
): Promise<boolean> {
  if (!platformMessageId) return false;
  const [row] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.channel, channel),
        eq(chatMessages.platformMessageId, platformMessageId)
      )
    )
    .limit(1);
  return !!row;
}

async function getRecentConversationMessages(
  conversationId: string,
  limit: number
): Promise<{ senderKind: string; content: string; createdAt: Date }[]> {
  const rows = await db
    .select({
      senderKind: chatMessages.senderKind,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
  return rows;
}

/**
 * A human operator answered recently (outbound senderKind="operator") — the
 * schema has no override column, so the fact itself is the signal.
 */
async function hasRecentOperatorMessage(
  conversationId: string,
  withinMs: number
): Promise<boolean> {
  const cutoff = new Date(Date.now() - withinMs);
  const [row] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.conversationId, conversationId),
        eq(chatMessages.direction, "outbound"),
        eq(chatMessages.senderKind, "operator"),
        gt(chatMessages.createdAt, cutoff)
      )
    )
    .limit(1);
  return !!row;
}

// ─── Turn dispatch seam ─────────────────────────────────────────────────────

/** One debounced batch, ready for the agent layer. */
export interface InboundTurn {
  channel: "whatsapp" | "telegram";
  conversationId: string;
  /** Canonical external user id — the conversation's external_thread_id. */
  externalThreadId: string;
  /** Provider addressable target (customer phone / chat id). */
  to: string;
  /** Provider-native thread for conversation-scoped providers (zernio). */
  providerConversationId?: string;
  account?: ChannelAccount;
  messages: BufferedMessage[];
}

/**
 * The turn-handoff seam. Default: AH's canonical router. Tests and future
 * domain layers swap the dispatcher without touching transport.
 */
export interface InboundTurnDispatcher {
  dispatch(turn: InboundTurn): Promise<void>;
}

/**
 * Builds the normalized message the router consumes for the whole batch. The
 * inbound rows are already persisted per-message, so `alreadyPersisted`
 * carries the LAST message's outcome — the router skips re-persisting and
 * keys its outbound reply to that row.
 */
function turnToNormalizedMessage(turn: InboundTurn, text: string): NormalizedMessage {
  const last = turn.messages[turn.messages.length - 1];
  return {
    channel: turn.channel,
    externalThreadId: turn.externalThreadId,
    platformMessageId: last?.messageId ?? `turn:${turn.conversationId}`,
    direction: "inbound",
    senderKind: "customer",
    contentType: "text",
    content: text,
    rawPayload: {
      bufferedMessageIds: turn.messages.map((m) => m.messageId),
    },
  };
}

export const defaultInboundTurnDispatcher: InboundTurnDispatcher = {
  async dispatch(turn) {
    const text = turn.messages
      .map((m) => m.content)
      .filter((content) => content.trim().length > 0)
      .join("\n\n")
      .trim();
    if (!text) return;

    const last = turn.messages[turn.messages.length - 1];
    const persisted: PersistedInbound = {
      ok: true,
      conversationId: turn.conversationId,
      messageId: last?.messageId ?? "",
      duplicate: false,
    };

    const result = await routeInboundMessage(
      turnToNormalizedMessage(turn, text),
      persisted
    );
    if (!result.replyText) return;

    const send = await messenger.send(
      {
        to: turn.to,
        type: "text",
        text: result.replyText,
        ...(turn.providerConversationId
          ? { providerConversationId: turn.providerConversationId }
          : {}),
      },
      turn.account ? { channel: turn.channel, account: turn.account } : {}
    );

    // The reply row was persisted before send (AH router contract: the
    // caller delivers). A failed send is marked on the row, not retried —
    // retrying dispatch would persist a second reply row (the router mints
    // a fresh synthetic platform id per attempt). The inbound fact is
    // durable either way; the failed delivery is visible for ops.
    if (result.replyMessageId) {
      await updateMessageDelivery(
        result.replyMessageId,
        send.ok ? "sent" : "failed"
      );
    }
    if (!send.ok) {
      console.warn(
        `[pipeline] ${turn.channel} turn reply send failed — ` +
          `retryable=${send.retryable} conversation=${turn.conversationId}: ${send.error}`
      );
    }
  },
};

let turnDispatcher: InboundTurnDispatcher = defaultInboundTurnDispatcher;

export function setInboundTurnDispatcher(dispatcher: InboundTurnDispatcher): void {
  turnDispatcher = dispatcher;
}

// ─── Event handlers ─────────────────────────────────────────────────────────

function mapContentType(
  type: NormalizedInboundEvent["type"]
): "text" | "image" | "document" {
  if (type === "image") return "image";
  if (type === "document") return "document";
  return "text";
}

function eventContent(event: NormalizedInboundEvent): string {
  const text = event.text?.trim();
  if (text) return text;
  return `[${event.type ?? event.kind}]`;
}

/**
 * Echoes — outbound sends mirrored back by the provider (our own API sends
 * and human sends from WhatsApp Business). They persist as operator-authored
 * outbound rows once the sender resolves to THIS install's account; our own
 * reply echoes are recognized by content and skipped.
 */
async function handleEcho(
  event: NormalizedInboundEvent,
  ctx: InboundContext
): Promise<NextResponse> {
  try {
    const customerPhone = event.providerConversationId;
    const botPhone = event.sender.phone;

    if (!customerPhone || !botPhone) {
      console.warn("[pipeline:echo] missing phone numbers in echo payload");
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Echo → account attribution: the business-side sender must match an
    // active row (providerAccountId, or the E.164 senderAddress). An
    // unmatched sender is a foreign echo → ack + ignore.
    const senderMatch = await matchSenderToChannelAccount(
      "whatsapp",
      {
        senderAddress: botPhone,
        providerAccountId: event.providerAccountId || undefined,
      },
      event.provider
    );
    if (senderMatch.kind === "db-error") {
      console.error(
        "[pipeline:echo] channel account lookup failed — retryable",
        senderMatch.error
      );
      return NextResponse.json(
        { error: "account-resolution-failed" },
        { status: 503 }
      );
    }
    if (senderMatch.kind === "unmatched" || senderMatch.kind === "mismatch") {
      console.warn(
        `[pipeline:echo] echo sender (providerAccountId ` +
          `${event.providerAccountId || "n/a"}) ` +
          (senderMatch.kind === "mismatch"
            ? `mismatched: ${senderMatch.reason}`
            : "matches no active account row") +
          " — ignoring"
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    const echoAccountId =
      senderMatch.kind === "matched"
        ? channelAccountRowId(senderMatch.account)
        : ctx.channelAccountId;

    const echoMsgId = event.platformMessageId;
    if (echoMsgId && (await isMessageDuplicate("whatsapp", echoMsgId))) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Conversation in the account's scope. A legacy null-account row is
    // never adopted by a bound account; env accounts stay in the legacy
    // partition (channelAccountRowId → undefined → null).
    let conversationId: string;
    let externalThreadId: string;
    try {
      const identity = await resolveConversationIdentity(
        drizzleConversationIdentityRepository,
        {
          channel: "whatsapp",
          externalUserId: customerPhone,
          channelAccountId: echoAccountId ?? null,
        }
      );
      conversationId = identity.record.id;
      externalThreadId = identity.normalizedExternalUserId;
    } catch (error) {
      if (error instanceof ConversationIdentityError) {
        console.warn(
          `[pipeline:echo] ${event.deliveryId} — ${error.message}; skipping`
        );
        return NextResponse.json({ ok: true }, { status: 200 });
      }
      throw error;
    }

    const displayText =
      event.type === "text" ? event.text ?? "" : event.text ?? `[${event.type}]`;

    // Own-reply echo: a stored agent message within 30s whose content (or any
    // of its bubbles) equals this echo's text means the provider is reporting
    // our own send back — the real platform id differs from the synthetic one
    // we persisted, so only content catches it.
    if (echoMsgId && displayText) {
      const recent = await getRecentConversationMessages(conversationId, 6);
      const cutoff = Date.now() - OWN_ECHO_LOOKBACK_MS;
      const isOwnBubbleEcho = recent.some(
        (message) =>
          message.senderKind === "agent" &&
          message.createdAt.getTime() > cutoff &&
          matchesAssistantBubble(message.content, displayText)
      );
      if (isOwnBubbleEcho) {
        return NextResponse.json({ ok: true }, { status: 200 });
      }
    }

    // Human/operator echo → persist as operator outbound. platformMessageId
    // is notNull in AH, so an id-less echo gets a deterministic synthetic id
    // that keeps redelivery dedupable.
    const outcome = await importOperatorOutbound({
      channel: "whatsapp",
      externalThreadId,
      platformMessageId:
        echoMsgId ?? `echo:${event.provider}:${event.deliveryId}`,
      senderRef: botPhone,
      contentType: mapContentType(event.type),
      content: displayText || `[${event.type ?? event.kind}]`,
      rawPayload: {
        provider: event.provider,
        deliveryId: event.deliveryId,
        echo: true,
        raw: event.raw,
      },
    });
    if (!outcome.ok && outcome.error === "persistence_failed") {
      return NextResponse.json({ error: "transient-failure" }, { status: 503 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[pipeline:echo] error processing echo:", error);
    if (classifyError(error) === "retryable-db") {
      return NextResponse.json({ error: "transient-failure" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "echo-processing-failed" },
      { status: 500 }
    );
  }
}

/**
 * A-03 — first-contact auto-reply, config-driven via the scoped
 * `agent_config` row (`autoReply24h` + `autoReply24hMessage`). Fires at most
 * once per conversation: the claim row IS the persisted reply — a concurrent
 * first message fails the claim insert, and a failed send releases the claim
 * so a burst sibling or a provider redelivery can retry. Best-effort: any
 * failure logs and the pipeline continues to the agent turn.
 */
async function maybeSendAutoReply(input: {
  channel: "whatsapp" | "telegram";
  conversationId: string;
  externalThreadId: string;
  customerPhone: string;
  ctx: InboundContext;
}): Promise<void> {
  const { channel, conversationId, externalThreadId, customerPhone, ctx } =
    input;
  try {
    const scope = await resolveScopeForConversation(conversationId);
    const resolution = await resolveAgentConfigStrict(scope);
    if (resolution.kind !== "resolved") return;
    const row = resolution.row;

    // G-01 kill-switch gates auto-replies too (no agent output at all), and
    // the web-order redirect supersedes the greeting on first contact
    // (SocialCRM parity: the agent offers /presupuesto instead).
    if (row.enabled === false) return;
    if (row.autoReply24h !== true) return;
    if (row.webOrderRedirectEnabled === true) return;
    const message = row.autoReply24hMessage?.trim();
    if (!message) return;

    const claimKey = autoReplyClaimKey(conversationId);
    const alreadyReplied = await isMessageDuplicate(channel, claimKey);
    const recent = alreadyReplied
      ? []
      : await getRecentConversationMessages(conversationId, 2);
    // The inbound row is already persisted, so "established" means anything
    // beyond this one message; `isNew` is covered by `!conversationHasMessages`.
    if (
      !shouldSendAutoReply({
        isNew: false,
        alreadyReplied,
        conversationHasMessages: recent.length > 1,
      })
    ) {
      return;
    }

    // Claim BEFORE sending: the platformMessageId unique index admits one
    // winner among concurrent first-contact deliveries.
    const claim = await persistAgentOutbound({
      channel,
      channelAccountId: ctx.channelAccountId ?? undefined,
      externalThreadId,
      platformMessageId: claimKey,
      senderRef: "auto-reply",
      contentType: "text",
      content: message.slice(0, 20000),
      deliveryState: "queued",
    });
    if (!claim.ok) {
      console.warn(
        `[pipeline] auto-reply claim failed for conv ${conversationId} — skipping send`
      );
      return;
    }
    if (claim.duplicate) return;

    const send = await messenger.send(
      {
        to: customerPhone,
        type: "text",
        text: message,
        idempotencyKey: claimKey,
      },
      ctx.account ? { channel, account: ctx.account } : { channel }
    );
    if (send.ok) {
      await updateMessageDelivery(claim.messageId, "sent");
      return;
    }
    // Release the claim so a burst sibling can re-claim and retry; the
    // persisted reply row only makes sense while it can still be delivered.
    await db
      .delete(chatMessages)
      .where(eq(chatMessages.id, claim.messageId))
      .catch(() => {});
    console.warn(
      `[pipeline] auto-reply send failed — claim released, conv ${conversationId}: ${send.error}`
    );
  } catch (error) {
    console.warn(
      `[pipeline] auto-reply skipped for conv ${conversationId}`,
      error
    );
  }
}

/**
 * Customer inbound — persist the canonical fact first (dedup-safe), link the
 * contact best-effort, then batch the burst through the debounce buffer and
 * hand ONE turn to the dispatcher. The webhook acks immediately; the agent
 * turn runs after the debounce window.
 */
async function handleInboundMessage(
  event: NormalizedInboundEvent,
  ctx: InboundContext
): Promise<NextResponse> {
  const channel = ctx.channel ?? "whatsapp";
  if (channel !== "whatsapp" && channel !== "telegram") {
    // Persistable-enum guard — the route only sends those here.
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Protocol artifacts (ycloud envelope shapes only) never reach persistence.
  if (event.provider === "ycloud" && isProtocolArtifact(event.raw)) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  let deliveryClaimed = false;
  try {
    // Delivery-level dedup FIRST: the marker insert is the claim — a lost
    // claim means this exact delivery was already handled.
    const marker = await persistChannelEvent(event, {
      channel,
      account: ctx.account ?? {
        id: `${channel}:agent-config`,
        tenantId: "default",
        provider: event.provider,
        channel,
        providerAccountId: "",
        senderAddress: "",
        credentials: { apiKey: "", webhookSecret: "" },
        status: "active",
      },
      channelAccountId: ctx.channelAccountId,
    });
    if (marker.kind === "duplicate") {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    deliveryClaimed = marker.kind === "persisted";

    const customerPhone = event.sender.phone ?? event.sender.socialId;
    const platformMessageId = event.platformMessageId;
    if (!customerPhone || !platformMessageId) {
      // No durable dedup anchor → the marker already records the event; ack.
      console.warn(
        `[pipeline] ${event.provider} ${event.deliveryId} — missing sender ` +
          `identity or platformMessageId; acknowledged via channel event only`
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (await isMessageDuplicate(channel, platformMessageId)) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Per-sender inbound limit — protects the agent loop, scoped so one
    // chatty customer can't starve others. Rate-limited → 429, and nothing
    // was persisted yet, so the provider's redelivery runs clean. The key is
    // account-scoped: the same phone on two provisioned accounts never
    // shares a bucket.
    const userKey = accountScopedInboundKey(
      ctx.channelAccountId,
      customerPhone
    );
    const rate = await checkRateLimit(
      `inbound:${channel}:${createHash("sha256").update(userKey).digest("hex").slice(0, 10)}`,
      {
        bucket: `inbound:${channel}`,
        limit: INBOUND_RATE_LIMIT,
        bucketLimit: INBOUND_RATE_LIMIT * 10,
      }
    );
    if (!rate.success) {
      await releaseChannelDeliveryMarker(
        event.provider,
        event.deliveryId,
        ctx.channelAccountId ?? null
      );
      deliveryClaimed = false;
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const externalThreadId = canonicalExternalUserId(channel, customerPhone);
    const persisted = await persistCustomerInbound({
      channel,
      externalThreadId,
      platformMessageId,
      senderRef: customerPhone,
      contentType: mapContentType(event.type),
      content: eventContent(event),
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
    if (!persisted.ok) {
      if (persisted.error === "persistence_failed") {
        await releaseChannelDeliveryMarker(
          event.provider,
          event.deliveryId,
          ctx.channelAccountId ?? null
        );
        deliveryClaimed = false;
        return NextResponse.json(
          { error: "transient-failure" },
          { status: 503 }
        );
      }
      // invalid_input is permanent — retrying can't fix it; the marker
      // keeps the durable record of the rejected event.
      console.warn(
        `[pipeline] ${event.provider} ${event.deliveryId} rejected by canonical intake`,
        persisted.issues
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    if (persisted.duplicate) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const conversationId = persisted.conversationId;

    // Best-effort contact linking — never fails the webhook.
    await ensureLeadIdentity({
      channel,
      externalUserId: customerPhone,
      externalUserIdNormalized: externalThreadId,
      customerName: event.sender.name ?? null,
      customerPhone: event.sender.phone ?? null,
      channelAccountId: ctx.channelAccountId ?? null,
      conversationId,
    });

    // Operator-active gate: a human answered within the window — suppress the
    // AI turn. The message stays persisted; only the reply is skipped.
    if (await hasRecentOperatorMessage(conversationId, OPERATOR_ACTIVE_WINDOW_MS)) {
      console.log(
        `[pipeline] ${channel} conv=${conversationId} — operator recently active, suppressing agent turn`
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // A-03 first-contact auto-reply — config-gated, claimed at most once per
    // conversation; best-effort so it never delays the agent turn.
    await maybeSendAutoReply({
      channel,
      conversationId,
      externalThreadId,
      customerPhone,
      ctx,
    });

    // Enqueue + schedule the debounced turn. Fire-and-forget: the webhook
    // acks now; the dispatcher runs after the quiet window.
    const content = eventContent(event);
    if (!(await BufferManager.isContentDuplicate(channel, userKey, content))) {
      await BufferManager.enqueue(channel, userKey, {
        content,
        messageId: persisted.messageId,
        timestamp: Date.now(),
      });
      scheduleBufferProcessing(channel, userKey, async (messages) => {
        await turnDispatcher.dispatch({
          channel,
          conversationId,
          externalThreadId,
          to: customerPhone,
          providerConversationId: event.providerConversationId,
          account: ctx.account,
          messages,
        });
      }).catch((err) =>
        console.error("[pipeline] buffer processing error:", err)
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error(
      `[pipeline] ${event.provider} kind=${event.kind} deliveryId=${event.deliveryId} — processing failed`,
      error
    );
    if (deliveryClaimed) {
      await releaseChannelDeliveryMarker(
        event.provider,
        event.deliveryId,
        ctx.channelAccountId ?? null
      );
    }
    if (classifyError(error) === "retryable-db") {
      return NextResponse.json({ error: "transient-failure" }, { status: 503 });
    }
    return NextResponse.json({ error: "processing-failed" }, { status: 500 });
  }
}

/**
 * Entry point for normalized events on agent-consumable channels. Kinds the
 * message pipeline doesn't own (status/lifecycle/other/comment) persist as
 * durable channel events and ack — no conversation lookup, no reply.
 */
export async function handleNormalizedEvent(
  event: NormalizedInboundEvent,
  ctx: InboundContext
): Promise<NextResponse> {
  if (event.kind === "message.echo") {
    return handleEcho(event, ctx);
  }
  if (event.kind === "message.received") {
    return handleInboundMessage(event, ctx);
  }

  const channel = ctx.channel;
  if (!channel) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  try {
    await persistChannelEvent(event, {
      channel,
      account: ctx.account ?? {
        id: `${channel}:agent-config`,
        tenantId: "default",
        provider: event.provider,
        channel,
        providerAccountId: "",
        senderAddress: "",
        credentials: { apiKey: "", webhookSecret: "" },
        status: "active",
      },
      channelAccountId: ctx.channelAccountId,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (classifyError(error) === "retryable-db") {
      return NextResponse.json({ error: "transient-failure" }, { status: 503 });
    }
    console.error(
      `[pipeline] ${event.provider} ${event.kind} ${event.deliveryId} — event persistence failed`,
      error
    );
    return NextResponse.json({ error: "persistence-failed" }, { status: 500 });
  }
}
