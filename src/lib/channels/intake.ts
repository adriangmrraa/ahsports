import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  chatMessages,
  conversations,
  idempotencyKeys,
  type AuditPayload,
} from "@/db/schema";
import { withDbTransaction, type DbTransaction } from "@/lib/db-transaction";
import {
  defaultDeliveryState,
  normalizedMessageSchema,
  type Channel,
  type DeliveryState,
  type NormalizedMessage,
} from "@/lib/channels/types";

/**
 * Canonical conversation intake.
 *
 * Persists every inbound/outbound message as a DB fact inside one transaction,
 * keyed by `${channel}:${platformMessageId}`. A duplicate provider delivery
 * resolves to a safe success with no new message, no duplicate draft and the
 * original audit trail preserved. Failures roll back the fact and record a
 * structured audit event outside the transaction.
 */

export const INTAKE_IDEMPOTENCY_SCOPE = "channel.intake";
export const INTAKE_IDEMPOTENCY_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type IntakeSuccess = {
  ok: true;
  conversationId: string;
  messageId: string;
  duplicate: boolean;
};

export type IntakeFailure = {
  ok: false;
  error: "invalid_input" | "persistence_failed";
  issues?: string[];
};

export type IntakeOutcome = IntakeSuccess | IntakeFailure;

export function intakeIdempotencyKey(channel: string, platformMessageId: string): string {
  return `${channel}:${platformMessageId}`;
}

/**
 * Validates untrusted input and persists it as a canonical message. Returns a
 * discriminated outcome so callers (routes) never have to catch to answer.
 */
export async function persistCanonicalMessage(input: unknown): Promise<IntakeOutcome> {
  const parsed = normalizedMessageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_input",
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    };
  }

  const message = parsed.data;
  const now = new Date();
  const deliveryState = message.deliveryState ?? defaultDeliveryState(message);
  const idempotencyKey = intakeIdempotencyKey(message.channel, message.platformMessageId);

  try {
    return await withDbTransaction(async (tx) => {
      const conversation = await upsertConversation(tx, message, now);
      const inserted = await insertMessage(tx, conversation.id, message, deliveryState, now);

      if (!inserted) {
        const existing = await findMessage(
          tx,
          message.channel,
          message.channelAccountId ?? null,
          message.platformMessageId,
        );
        await recordAudit(tx, {
          action: "channel.message.duplicate_ignored",
          actorKind: "channel",
          actorRef: message.channel,
          entityType: "chat_message",
          entityId: existing?.id ?? null,
          correlationId: idempotencyKey,
          payload: {
            after: { channel: message.channel, platformMessageId: message.platformMessageId, duplicate: true },
          },
          createdAt: now,
        });
        return {
          ok: true,
          conversationId: conversation.id,
          messageId: existing?.id ?? "",
          duplicate: true,
        } satisfies IntakeSuccess;
      }

      await recordIdempotencyKey(tx, idempotencyKey, inserted.id, now);
      await recordAudit(tx, {
        action: "channel.message.persisted",
        actorKind: "channel",
        actorRef: message.channel,
        entityType: "chat_message",
        entityId: inserted.id,
        correlationId: idempotencyKey,
        payload: {
          after: {
            channel: message.channel,
            direction: message.direction,
            senderKind: message.senderKind,
            deliveryState,
          },
        },
        createdAt: now,
      });

      return {
        ok: true,
        conversationId: conversation.id,
        messageId: inserted.id,
        duplicate: false,
      } satisfies IntakeSuccess;
    });
  } catch {
    // The transaction rolled back, so the failure audit runs on the HTTP driver
    // outside it. Best-effort and secret-free.
    await recordFailureAudit(idempotencyKey, message, now);
    return { ok: false, error: "persistence_failed" };
  }
}

/** P1.2 — persist a customer inbound message. */
export function persistCustomerInbound(input: Record<string, unknown>): Promise<IntakeOutcome> {
  return persistCanonicalMessage({ ...input, direction: "inbound", senderKind: "customer" });
}

/** P1.3 — persist an AI/agent outbound message. */
export function persistAgentOutbound(input: Record<string, unknown>): Promise<IntakeOutcome> {
  return persistCanonicalMessage({ ...input, direction: "outbound", senderKind: "agent" });
}

/**
 * P1.4 — persist an imported WhatsApp Business operator outbound message.
 * Observe/import only: no WhatsApp provider client and no send path exist.
 */
export function importOperatorOutbound(input: Record<string, unknown>): Promise<IntakeOutcome> {
  return persistCanonicalMessage({
    ...input,
    channel: "whatsapp",
    direction: "outbound",
    senderKind: "operator",
    deliveryState: "imported",
  });
}

/** Transition a persisted message's delivery state after channel confirmation. */
export async function updateMessageDelivery(messageId: string, deliveryState: DeliveryState): Promise<void> {
  await db.update(chatMessages).set({ deliveryState }).where(eq(chatMessages.id, messageId));
}

async function upsertConversation(tx: DbTransaction, message: NormalizedMessage, now: Date) {
  const incrementUnread = message.direction === "inbound" && message.senderKind === "customer";
  const customerId = message.customerId ?? null;
  const organizationId = message.organizationId ?? null;
  const channelAccountId = message.channelAccountId ?? null;

  // Conversation identity is split by account scope: a provisioned account
  // writes through its own partial unique index and never adopts a legacy
  // NULL-account row; legacy rows dedup on (channel, external_thread_id).
  // channelAccountId is set on INSERT only — a conflict update never rebinds.
  const conflict = channelAccountId
    ? {
        target: [conversations.channel, conversations.channelAccountId, conversations.externalThreadId],
        targetWhere: sql`${conversations.channelAccountId} is not null`,
      }
    : {
        target: [conversations.channel, conversations.externalThreadId],
        targetWhere: sql`${conversations.channelAccountId} is null`,
      };

  const [conversation] = await tx
    .insert(conversations)
    .values({
      channel: message.channel,
      channelAccountId,
      externalThreadId: message.externalThreadId,
      customerId,
      organizationId,
      lastMessageAt: now,
      unreadCount: incrementUnread ? 1 : 0,
    })
    .onConflictDoUpdate({
      ...conflict,
      set: {
        lastMessageAt: now,
        customerId: sql`coalesce(${conversations.customerId}, ${customerId})`,
        organizationId: sql`coalesce(${conversations.organizationId}, ${organizationId})`,
        unreadCount: incrementUnread
          ? sql`${conversations.unreadCount} + 1`
          : sql`${conversations.unreadCount}`,
      },
    })
    .returning({ id: conversations.id });

  if (!conversation) {
    throw new Error("conversation upsert returned no row");
  }
  return conversation;
}

async function insertMessage(
  tx: DbTransaction,
  conversationId: string,
  message: NormalizedMessage,
  deliveryState: DeliveryState,
  now: Date,
) {
  const [inserted] = await tx
    .insert(chatMessages)
    .values({
      conversationId,
      channel: message.channel,
      channelAccountId: message.channelAccountId ?? null,
      platformMessageId: message.platformMessageId,
      direction: message.direction,
      senderKind: message.senderKind,
      senderRef: message.senderRef ?? null,
      contentType: message.contentType,
      content: message.content,
      rawPayload: message.rawPayload ?? null,
      deliveryState,
      createdAt: now,
    })
    // No arbiter needed: the two partial uniques partition dedup by account
    // scope (bound rows vs. legacy NULL rows) and any violation is a dup.
    .onConflictDoNothing()
    .returning({ id: chatMessages.id });

  return inserted ?? null;
}

async function findMessage(
  tx: DbTransaction,
  channel: Channel,
  channelAccountId: string | null,
  platformMessageId: string,
) {
  const [row] = await tx
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.channel, channel),
        channelAccountId === null
          ? isNull(chatMessages.channelAccountId)
          : eq(chatMessages.channelAccountId, channelAccountId),
        eq(chatMessages.platformMessageId, platformMessageId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function recordIdempotencyKey(tx: DbTransaction, key: string, messageId: string, now: Date) {
  await tx
    .insert(idempotencyKeys)
    .values({
      key,
      scope: INTAKE_IDEMPOTENCY_SCOPE,
      response: { messageId },
      createdAt: now,
      expiresAt: new Date(now.getTime() + INTAKE_IDEMPOTENCY_TTL_MS),
    })
    .onConflictDoNothing({ target: idempotencyKeys.key });
}

type AuditEntry = {
  action: string;
  actorKind: "system" | "user" | "agent" | "channel";
  actorRef: string | null;
  entityType: string;
  entityId: string | null;
  correlationId: string;
  payload: AuditPayload;
  createdAt: Date;
};

async function recordAudit(tx: DbTransaction, entry: AuditEntry) {
  await tx.insert(auditEvents).values(entry);
}

async function recordFailureAudit(idempotencyKey: string, message: NormalizedMessage, now: Date) {
  try {
    await db.insert(auditEvents).values({
      action: "channel.message.failed",
      actorKind: "channel",
      actorRef: message.channel,
      entityType: "chat_message",
      correlationId: idempotencyKey,
      payload: { error: "persistence_failed" },
      createdAt: now,
    });
  } catch {
    // Never surface secrets or crash on the failure-audit path.
  }
}
