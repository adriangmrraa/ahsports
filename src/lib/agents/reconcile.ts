import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lt, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  agentConfig,
  agentMemories,
  auditEvents,
  chatMessages,
  conversations,
  idempotencyKeys,
  type AuditPayload,
} from "@/db/schema";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { sendTelegramMessage } from "@/lib/channels/telegram";
import {
  findInboundWithoutReply,
  shouldScrubRawPayload,
  INBOUND_WITHOUT_REPLY_WINDOW_MS,
  NO_REPLY_AUDIT_DEDUPE_TTL_MS,
  RECONCILE_DEFAULT_BATCH_SIZE,
  type MessageFact,
} from "@/lib/agents/retention";

/**
 * Reconcile job (P5).
 *
 * Idempotent, retry-safe maintenance run for the agent platform. Each step is a
 * bounded, individually idempotent mutation that writes an insert-only
 * `audit_events` row; running the job repeatedly (or concurrently) never
 * double-delivers a message and never creates a new DB fact:
 *
 *   1. purge expired `idempotency_keys`;
 *   2. delete expired `agent_memories`;
 *   3. scrub `raw_payload` (PII) past the retention window;
 *   4. re-deliver outbound Telegram messages stuck in `failed` (claimed via a
 *      conditional `failed → queued` update, so overlapping runs cannot both
 *      send);
 *   5. flag recent inbound messages whose conversation has no later outbound.
 *
 * No step finalizes an order, charges a payment or advances production.
 */

export const NO_REPLY_IDEMPOTENCY_SCOPE = "reconcile.no_reply";

export type ReconcileSummary = {
  ranAt: string;
  correlationId: string;
  idempotencyKeysPurged: number;
  memoriesExpired: number;
  rawPayloadsScrubbed: number;
  deliveriesRetried: number;
  deliveriesSent: number;
  deliveriesFailed: number;
  inboundWithoutReply: number;
  auditsWritten: number;
};

export type ReconcileOptions = {
  now?: Date;
  batchSize?: number;
};

type AuditInput = {
  action: string;
  actorKind?: "system" | "channel";
  actorRef?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  correlationId?: string | null;
  payload?: AuditPayload;
};

async function writeAudit(entry: AuditInput, runId: string, now: Date): Promise<void> {
  await db.insert(auditEvents).values({
    action: entry.action,
    actorKind: entry.actorKind ?? "system",
    actorRef: entry.actorRef ?? null,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    correlationId: entry.correlationId ?? runId,
    payload: entry.payload ?? null,
    createdAt: now,
  });
}

async function purgeExpiredIdempotencyKeys(now: Date, batchSize: number): Promise<number> {
  const expiring = await db
    .select({ key: idempotencyKeys.key })
    .from(idempotencyKeys)
    .where(lt(idempotencyKeys.expiresAt, now))
    .limit(batchSize);
  if (expiring.length === 0) return 0;

  const deleted = await db
    .delete(idempotencyKeys)
    .where(inArray(idempotencyKeys.key, expiring.map((row) => row.key)))
    .returning({ key: idempotencyKeys.key });
  return deleted.length;
}

async function deleteExpiredMemories(now: Date, batchSize: number): Promise<number> {
  const expiring = await db
    .select({ id: agentMemories.id })
    .from(agentMemories)
    .where(lt(agentMemories.expiresAt, now))
    .limit(batchSize);
  if (expiring.length === 0) return 0;

  const deleted = await db
    .delete(agentMemories)
    .where(inArray(agentMemories.id, expiring.map((row) => row.id)))
    .returning({ id: agentMemories.id });
  return deleted.length;
}

async function scrubRawPayloads(now: Date, batchSize: number): Promise<number> {
  const candidates = await db
    .select({ id: chatMessages.id, createdAt: chatMessages.createdAt, rawPayload: chatMessages.rawPayload })
    .from(chatMessages)
    .where(isNotNull(chatMessages.rawPayload))
    .orderBy(asc(chatMessages.createdAt))
    .limit(batchSize);

  const targets = candidates.filter((row) => shouldScrubRawPayload(row, now));
  if (targets.length === 0) return 0;

  const updated = await db
    .update(chatMessages)
    .set({ rawPayload: null })
    .where(inArray(chatMessages.id, targets.map((row) => row.id)))
    .returning({ id: chatMessages.id });
  return updated.length;
}

type RetryOutcome = { retried: number; sent: number; failed: number };

/**
 * Re-delivers failed outbound Telegram messages. A message is claimed with a
 * conditional `failed → queued` update that returns a row only to the run that
 * wins the race; the loser skips it. Success transitions to `sent`, failure
 * restores `failed` so a later run retries. The canonical fact is updated in
 * place — no new `chat_messages` row is ever inserted.
 */
async function retryFailedDeliveries(
  now: Date,
  runId: string,
  batchSize: number,
): Promise<RetryOutcome> {
  const [config] = await db
    .select({ botTokenEnc: agentConfig.botTokenEnc })
    .from(agentConfig)
    .where(eq(agentConfig.id, 1))
    .limit(1);
  const botToken = decryptSecret(config?.botTokenEnc ?? "");
  if (!botToken) {
    await writeAudit(
      { action: "agent.reconcile.retry_skipped", payload: { error: "not_configured" } },
      runId,
      now,
    );
    return { retried: 0, sent: 0, failed: 0 };
  }

  const failed = await db
    .select({
      id: chatMessages.id,
      platformMessageId: chatMessages.platformMessageId,
      content: chatMessages.content,
      chatId: conversations.externalThreadId,
    })
    .from(chatMessages)
    .innerJoin(conversations, eq(chatMessages.conversationId, conversations.id))
    .where(
      and(
        eq(chatMessages.direction, "outbound"),
        eq(chatMessages.channel, "telegram"),
        eq(chatMessages.deliveryState, "failed"),
      ),
    )
    .orderBy(asc(chatMessages.createdAt))
    .limit(batchSize);

  let retried = 0;
  let sent = 0;
  let failedCount = 0;

  for (const row of failed) {
    if (!row.content) continue;

    const claimed = await db
      .update(chatMessages)
      .set({ deliveryState: "queued" })
      .where(and(eq(chatMessages.id, row.id), eq(chatMessages.deliveryState, "failed")))
      .returning({ id: chatMessages.id });
    if (claimed.length === 0) continue;

    retried += 1;
    const result = await sendTelegramMessage(botToken, row.chatId, row.content);
    const nextState = result.ok ? "sent" : "failed";
    if (result.ok) sent += 1;
    else failedCount += 1;

    await db.update(chatMessages).set({ deliveryState: nextState }).where(eq(chatMessages.id, row.id));
    await writeAudit(
      {
        action: result.ok ? "agent.message.retry_succeeded" : "agent.message.retry_failed",
        actorKind: "channel",
        actorRef: "telegram",
        entityType: "chat_message",
        entityId: row.id,
        correlationId: row.platformMessageId,
        payload: result.ok ? { after: { deliveryState: "sent" } } : { error: result.error },
      },
      runId,
      now,
    );
  }

  return { retried, sent, failed: failedCount };
}

async function reconcileInboundWithoutReply(
  now: Date,
  runId: string,
  batchSize: number,
): Promise<number> {
  const cutoff = new Date(now.getTime() - INBOUND_WITHOUT_REPLY_WINDOW_MS);
  const outbound = alias(chatMessages, "outbound");

  const candidates = await db
    .select({
      id: chatMessages.id,
      conversationId: chatMessages.conversationId,
      direction: chatMessages.direction,
      senderKind: chatMessages.senderKind,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.direction, "inbound"),
        inArray(chatMessages.senderKind, ["customer", "operator"]),
        gte(chatMessages.createdAt, cutoff),
        notExists(
          db
            .select({ one: sql`1` })
            .from(outbound)
            .where(
              and(
                eq(outbound.conversationId, chatMessages.conversationId),
                eq(outbound.direction, "outbound"),
                gt(outbound.createdAt, chatMessages.createdAt),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(batchSize * 5);

  const gaps = findInboundWithoutReply(candidates as MessageFact[]);

  let emitted = 0;
  for (const gap of gaps) {
    const claim = await db
      .insert(idempotencyKeys)
      .values({
        key: `${NO_REPLY_IDEMPOTENCY_SCOPE}:${gap.conversationId}`.slice(0, 255),
        scope: NO_REPLY_IDEMPOTENCY_SCOPE,
        response: { messageId: gap.messageId },
        createdAt: now,
        expiresAt: new Date(now.getTime() + NO_REPLY_AUDIT_DEDUPE_TTL_MS),
      })
      .onConflictDoNothing({ target: idempotencyKeys.key })
      .returning({ key: idempotencyKeys.key });
    if (claim.length === 0) continue;

    emitted += 1;
    await writeAudit(
      {
        action: "agent.message.inbound_without_reply",
        actorKind: "system",
        entityType: "conversation",
        entityId: gap.conversationId,
        payload: {
          after: {
            messageId: gap.messageId,
            senderKind: gap.senderKind,
            unansweredCount: gap.unansweredCount,
            createdAt: gap.createdAt,
          },
        },
      },
      runId,
      now,
    );
  }

  return emitted;
}

/**
 * Runs the full reconcile pass. Every step is idempotent; a failure audits
 * `agent.reconcile.failed` (best-effort) and rethrows so the caller can answer
 * with an error status without pretending success.
 */
export async function runReconcile(options: ReconcileOptions = {}): Promise<ReconcileSummary> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? RECONCILE_DEFAULT_BATCH_SIZE;
  const correlationId = randomUUID();

  try {
    const idempotencyKeysPurged = await purgeExpiredIdempotencyKeys(now, batchSize);
    if (idempotencyKeysPurged > 0) {
      await writeAudit(
        { action: "agent.reconcile.idempotency_purged", payload: { after: { count: idempotencyKeysPurged } } },
        correlationId,
        now,
      );
    }

    const memoriesExpired = await deleteExpiredMemories(now, batchSize);
    if (memoriesExpired > 0) {
      await writeAudit(
        { action: "agent.memory.expired", payload: { after: { count: memoriesExpired } } },
        correlationId,
        now,
      );
    }

    const rawPayloadsScrubbed = await scrubRawPayloads(now, batchSize);
    if (rawPayloadsScrubbed > 0) {
      await writeAudit(
        { action: "agent.message.raw_payload_scrubbed", payload: { after: { count: rawPayloadsScrubbed } } },
        correlationId,
        now,
      );
    }

    const retry = await retryFailedDeliveries(now, correlationId, batchSize);
    const inboundWithoutReply = await reconcileInboundWithoutReply(now, correlationId, batchSize);

    const summary: ReconcileSummary = {
      ranAt: now.toISOString(),
      correlationId,
      idempotencyKeysPurged,
      memoriesExpired,
      rawPayloadsScrubbed,
      deliveriesRetried: retry.retried,
      deliveriesSent: retry.sent,
      deliveriesFailed: retry.failed,
      inboundWithoutReply,
      auditsWritten: 0,
    };

    await writeAudit(
      { action: "agent.reconcile.completed", payload: { after: summary } },
      correlationId,
      now,
    );
    return summary;
  } catch (error) {
    try {
      await writeAudit(
        {
          action: "agent.reconcile.failed",
          payload: { error: error instanceof Error ? error.message.slice(0, 500) : "unknown_error" },
        },
        correlationId,
        now,
      );
    } catch {
      // Never mask the original failure with a best-effort audit failure.
    }
    throw error;
  }
}
