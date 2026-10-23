import "server-only";

import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { chatMessages, conversations } from "@/db/schema";
import { resolveAgentConfig } from "@/lib/channels/agent-config-scope";
import { persistCanonicalMessage, updateMessageDelivery } from "@/lib/channels/intake";
import { decideSendAccount } from "@/lib/channels/send-account";
import { sendTelegramMessage } from "@/lib/channels/telegram";
import type { Channel, DeliveryState } from "@/lib/channels/types";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { messenger } from "@/lib/messaging/messenger";
import { isChannelKind as isMessagingChannelKind } from "@/lib/messaging/registry";
import type { ChannelKind, ProviderId, SendResult } from "@/lib/messaging/types";
import {
  decideCustomerWindowSend,
  type WindowSendDecision,
} from "@/lib/whatsapp/outbound-window";

/**
 * Operator reply transport — the operator→conversation half of the human
 * handoff (parity with SocialCRM `sendOutboundMessage`, adapted to AH's
 * channel-accounts model).
 *
 * Every send persists a canonical outbound fact BEFORE delivery — a reply that
 * cannot be persisted is never sent (the sales-agent rule: an invisible reply
 * is worse than a retryable silence). The fact rides the conversation's own
 * account partition: a bound thread is answered by its bound account, a legacy
 * thread by the channel's single active account (ambiguous → fail closed).
 *
 * Delivery surfaces, in order:
 *   1. telegram conversations → internal bot (`sendTelegramMessage`), outside
 *      the provider model — the bot token comes from the bound account's
 *      resolved credentials, else the telegram-scoped/global agent_config.
 *   2. messenger channels (whatsapp/instagram/facebook/sms) →
 *      `decideSendAccount` + `messenger.send`; zernio threads send into the
 *      provider-native conversation id recovered from inbound rawPayload.
 *   3. anything else → a graceful `channel_unsupported` failure.
 */

export type OperatorSendResult =
  | { ok: true; messageId: string; deliveryState: DeliveryState }
  | { ok: false; error: string; retryable: boolean; messageId?: string };

type ConversationRow = {
  id: string;
  channel: Channel;
  externalThreadId: string;
  channelAccountId: string | null;
  customerId: string | null;
  organizationId: string | null;
};

type TransportOutcome =
  | { ok: true; platformMessageId: string }
  | { ok: false; error: string; retryable: boolean };

/**
 * Provider-native thread for conversation-scoped sends (zernio DMs) — the
 * last inbound's `providerConversationId`. Exported: the order-status
 * notifier needs the same thread or zernio opens a NEW conversation per send.
 */
export async function loadProviderThreadId(conversationId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ rawPayload: chatMessages.rawPayload })
    .from(chatMessages)
    .where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.direction, "inbound")))
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);
  const raw = row?.rawPayload;
  const id = raw?.providerConversationId ?? raw?.providerThreadId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/** Bot token for a legacy (unbound) telegram thread: channel-scoped, else global. */
async function resolveTelegramBotToken(): Promise<string> {
  const row = await resolveAgentConfig({ channel: "telegram" });
  return decryptSecret(row?.botTokenEnc ?? "");
}

async function deliverViaTelegram(conversation: ConversationRow, text: string): Promise<TransportOutcome> {
  const decision = await decideSendAccount("telegram", conversation.externalThreadId);
  if (decision.kind === "retry") {
    return { ok: false, error: "account_resolution_retryable", retryable: true };
  }
  if (decision.kind === "drop") {
    return { ok: false, error: `account_resolution:${decision.reason.slice(0, 120)}`, retryable: false };
  }
  const botToken =
    decision.account?.credentials.accessToken || (await resolveTelegramBotToken());
  if (!botToken) {
    return { ok: false, error: "missing_bot_token", retryable: false };
  }
  const sent = await sendTelegramMessage(botToken, conversation.externalThreadId, text);
  if (!sent.ok) {
    return { ok: false, error: sent.error, retryable: false };
  }
  // `tg-out:` keeps the fact in a different id space than inbound
  // `${chatId}:${message_id}` — both consume Telegram's per-chat sequence.
  return {
    ok: true,
    platformMessageId: sent.messageId
      ? `tg-out:${conversation.externalThreadId}:${sent.messageId}`
      : "",
  };
}

async function deliverViaMessenger(
  conversation: ConversationRow,
  text: string,
  windowDecision: WindowSendDecision,
): Promise<TransportOutcome> {
  const decision = await decideSendAccount(conversation.channel, conversation.externalThreadId);
  if (decision.kind === "retry") {
    return { ok: false, error: "account_resolution_retryable", retryable: true };
  }
  if (decision.kind === "drop") {
    return { ok: false, error: `account_resolution:${decision.reason.slice(0, 120)}`, retryable: false };
  }

  const account = decision.account;
  // messenger routes only through messaging providers (ycloud/zernio/kapso);
  // a messenger channel bound to a telegram account is a provisioning bug —
  // drop, never send.
  if (account && account.provider === "telegram") {
    return { ok: false, error: "account_provider_mismatch", retryable: false };
  }

  const providerConversationId =
    account?.provider === "zernio" ? await loadProviderThreadId(conversation.id) : undefined;

  // F-02: outside the 24h customer window Meta rejects free-form text — only
  // the configured fallback template is deliverable. With no template the
  // text is still attempted (the failure lands on the row, truthfully).
  const sendAsTemplate = windowDecision.kind === "template";
  const send: SendResult = await messenger.send(
    sendAsTemplate
      ? {
          to: conversation.externalThreadId,
          type: "template",
          template: windowDecision.template,
          idempotencyKey: `op-reply:${conversation.id}:${randomUUID()}`,
          ...(providerConversationId ? { providerConversationId } : {}),
        }
      : {
          to: conversation.externalThreadId,
          type: "text",
          text,
          idempotencyKey: `op-reply:${conversation.id}:${randomUUID()}`,
          ...(providerConversationId ? { providerConversationId } : {}),
        },
    account
      ? {
          channel: conversation.channel as ChannelKind,
          account: {
            ...account,
            provider: account.provider as ProviderId,
            channel: account.channel as ChannelKind,
          },
        }
      : { channel: conversation.channel as ChannelKind },
  );
  if (!send.ok) {
    return { ok: false, error: send.error.slice(0, 120), retryable: send.retryable };
  }
  if (windowDecision.kind === "text" && !windowDecision.windowOpen) {
    console.warn(
      `[operator-send] 24h window closed and wa_template_fallback is not configured — text reply attempted, delivery may be rejected — conversation=${conversation.id}`,
    );
  }
  return { ok: true, platformMessageId: send.providerMessageId };
}

async function deliver(
  conversation: ConversationRow,
  text: string,
  windowDecision: WindowSendDecision,
): Promise<TransportOutcome> {
  if (conversation.channel === "telegram") {
    return deliverViaTelegram(conversation, text);
  }
  if (!isMessagingChannelKind(conversation.channel)) {
    return { ok: false, error: "channel_unsupported", retryable: false };
  }
  return deliverViaMessenger(conversation, text, windowDecision);
}

/**
 * Marks the persisted fact after delivery: final state plus the provider's
 * real platform id (stamping it is what lets a provider echo dedup against
 * this row instead of persisting a second operator message). If the echo beat
 * us to the id (23505 race), the echo row IS the same send — the pending
 * op-reply row is folded into it rather than left next to it in the
 * transcript. Any other failure degrades to state-only: the fact must never
 * be left "queued" for a delivered send.
 */
async function stampDeliveryResult(messageId: string, outcome: TransportOutcome): Promise<void> {
  const deliveryState: DeliveryState = outcome.ok ? "sent" : "failed";
  try {
    await db
      .update(chatMessages)
      .set({
        deliveryState,
        ...(outcome.ok && outcome.platformMessageId
          ? { platformMessageId: outcome.platformMessageId }
          : {}),
      })
      .where(eq(chatMessages.id, messageId));
  } catch (error) {
    if (
      (error as { code?: string } | null)?.code === "23505" &&
      outcome.ok &&
      outcome.platformMessageId
    ) {
      const [echoRow] = await db
        .select({
          id: chatMessages.id,
          conversationId: chatMessages.conversationId,
        })
        .from(chatMessages)
        .where(eq(chatMessages.platformMessageId, outcome.platformMessageId))
        .limit(1);
      const [pending] = await db
        .select({ conversationId: chatMessages.conversationId })
        .from(chatMessages)
        .where(eq(chatMessages.id, messageId))
        .limit(1);
      if (echoRow && pending && echoRow.conversationId === pending.conversationId) {
        await db
          .delete(chatMessages)
          .where(eq(chatMessages.id, messageId))
          .catch(() => {});
        return;
      }
    }
    await updateMessageDelivery(messageId, deliveryState).catch(() => {});
  }
}

/**
 * Sends `text` into the conversation as an operator. Persists the outbound
 * fact first (queued); the send updates it to sent/failed — no fire-and-
 * forget sends, ever.
 */
export async function sendOperatorReply(input: {
  conversationId: string;
  text: string;
  /** Operator identity stamped as senderRef (session user id). */
  operatorRef: string;
}): Promise<OperatorSendResult> {
  const [conversation] = await db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      externalThreadId: conversations.externalThreadId,
      channelAccountId: conversations.channelAccountId,
      customerId: conversations.customerId,
      organizationId: conversations.organizationId,
    })
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1);
  if (!conversation) {
    return { ok: false, error: "conversation_not_found", retryable: false };
  }

  // F-02 gate (whatsapp): outside the 24h customer window free-form text is
  // undeliverable — the approved fallback template goes out instead. Decided
  // BEFORE persisting so the fact records how the send actually went out.
  // A decision failure degrades to "window open" — never blocks a reply.
  const windowDecision: WindowSendDecision =
    conversation.channel === "whatsapp"
      ? await decideCustomerWindowSend(conversation.id).catch(
          () => ({ kind: "text", windowOpen: true }) as WindowSendDecision,
        )
      : { kind: "text", windowOpen: true };
  const sendAsTemplate = windowDecision.kind === "template";
  const windowClosedWithoutTemplate =
    windowDecision.kind === "text" && !windowDecision.windowOpen;

  const persisted = await persistCanonicalMessage({
    channel: conversation.channel,
    channelAccountId: conversation.channelAccountId ?? null,
    externalThreadId: conversation.externalThreadId,
    platformMessageId: `op-reply:${conversation.id}:${randomUUID()}`,
    direction: "outbound",
    senderKind: "operator",
    senderRef: input.operatorRef,
    contentType: "text",
    content: input.text,
    deliveryState: "queued",
    customerId: conversation.customerId ?? undefined,
    organizationId: conversation.organizationId ?? undefined,
    rawPayload: {
      source: "inbox.sendReply",
      ...(sendAsTemplate
        ? { sentAs: "template", template: windowDecision.template }
        : {}),
      ...(windowClosedWithoutTemplate
        ? { windowClosed: true, templateFallback: "not_configured" }
        : {}),
    },
  });
  if (!persisted.ok) {
    return { ok: false, error: "persistence_failed", retryable: true };
  }

  let outcome: TransportOutcome;
  try {
    outcome = await deliver(conversation, input.text, windowDecision);
  } catch {
    // Resolution-layer throws (agent-config/credential errors) surface as a
    // retryable transport failure — the persisted fact still flips to failed.
    outcome = { ok: false, error: "transport_error", retryable: true };
  }
  await stampDeliveryResult(persisted.messageId, outcome);

  if (!outcome.ok) {
    return {
      ok: false,
      error: outcome.error,
      retryable: outcome.retryable,
      messageId: persisted.messageId,
    };
  }
  return { ok: true, messageId: persisted.messageId, deliveryState: "sent" };
}
