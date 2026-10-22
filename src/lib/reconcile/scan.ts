import "server-only";

import { and, asc, desc, eq, gt, like } from "drizzle-orm";
import { db } from "@/db/client";
import { agentMemories, chatMessages, conversations } from "@/db/schema";

/**
 * Candidates-reconcile scan — port of SocialCRM `reconcile/scan.ts`.
 *
 * Finds whatsapp conversations with NEW customer activity since their
 * per-conversation watermark (`agent_memories` `reconcile:watermark:{id}`) and
 * hands them to the runner for a read-only deep pass. The scan itself is
 * SQL-only: it never calls a model, never writes anything except the durable
 * watermark after a successful pass.
 */

export const RECONCILE_WATERMARK_PREFIX = "reconcile:watermark:";
export const RECONCILE_DEFAULT_LOOKBACK_HOURS = 72;
export const RECONCILE_MIN_NEW_MESSAGES = 2;

export type ReconcileTarget = {
  conversationId: string;
  /** Only messages strictly after this instant are evidence (null = lookback floor). */
  since: Date | null;
};

type WatermarkValue = { lastMessageAt?: string; reconciledAt?: string };

async function loadWatermarks(): Promise<Map<string, WatermarkValue>> {
  const rows = await db
    .select({ key: agentMemories.key, value: agentMemories.value })
    .from(agentMemories)
    .where(like(agentMemories.key, `${RECONCILE_WATERMARK_PREFIX}%`));
  const map = new Map<string, WatermarkValue>();
  for (const row of rows) {
    map.set(row.key.slice(RECONCILE_WATERMARK_PREFIX.length), row.value as WatermarkValue);
  }
  return map;
}

/**
 * SQL-only candidate scan: whatsapp conversations whose latest customer
 * inbound lands inside the lookback window AND strictly after the stored
 * watermark, with at least `minNewMessages` unseen inbound messages.
 */
export async function findConversationsNeedingReconcile(input: {
  now: Date;
  lookbackHours?: number;
  minNewMessages?: number;
  limit?: number;
}): Promise<ReconcileTarget[]> {
  const lookbackHours = input.lookbackHours ?? RECONCILE_DEFAULT_LOOKBACK_HOURS;
  const minNew = input.minNewMessages ?? RECONCILE_MIN_NEW_MESSAGES;
  const limit = input.limit ?? 25;
  const floor = new Date(input.now.getTime() - lookbackHours * 60 * 60 * 1000);

  const convs = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.channel, "whatsapp"))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit * 4);

  const watermarks = await loadWatermarks();
  const targets: ReconcileTarget[] = [];

  for (const conv of convs) {
    if (targets.length >= limit) break;
    const watermark = watermarks.get(conv.id);
    const since = watermark?.lastMessageAt ? new Date(watermark.lastMessageAt) : null;
    if (since && Number.isNaN(since.getTime())) continue;

    const floorDate = since && since > floor ? since : floor;
    const recent = await db
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.conversationId, conv.id),
          eq(chatMessages.direction, "inbound"),
          eq(chatMessages.senderKind, "customer"),
          gt(chatMessages.createdAt, floorDate),
        ),
      )
      .limit(minNew);

    if (recent.length >= minNew) {
      targets.push({ conversationId: conv.id, since });
    }
  }

  return targets;
}

export type TranscriptMessage = {
  direction: "inbound" | "outbound";
  senderKind: "customer" | "agent" | "operator";
  content: string;
  createdAt: Date;
};

/** Transcript evidence for the deep pass — raw rows, sanitization happens in the runner's prompt build. */
export async function fetchTranscript(conversationId: string, after: Date | null, limit = 80): Promise<TranscriptMessage[]> {
  const filters = [eq(chatMessages.conversationId, conversationId)];
  if (after) filters.push(gt(chatMessages.createdAt, after));
  const rows = await db
    .select({
      direction: chatMessages.direction,
      senderKind: chatMessages.senderKind,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(and(...filters))
    .orderBy(asc(chatMessages.createdAt))
    .limit(limit);
  return rows as TranscriptMessage[];
}

/** Durable per-conversation watermark — the idempotency anchor of the scan. */
export async function markConversationReconciled(conversationId: string, upTo: Date): Promise<void> {
  const value = { lastMessageAt: upTo.toISOString(), reconciledAt: new Date().toISOString() };
  await db
    .insert(agentMemories)
    .values({ scope: "global", key: `${RECONCILE_WATERMARK_PREFIX}${conversationId}`, value })
    .onConflictDoUpdate({
      target: [agentMemories.scope, agentMemories.key],
      set: { value },
    });
}

