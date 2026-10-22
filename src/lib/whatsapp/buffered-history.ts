/**
 * History/buffer reconciliation for the customer WhatsApp agent.
 *
 * Port of SocialCRM `src/lib/whatsapp/buffered-history.ts`, adapted to AH's
 * `BufferedMessage` shape (`{content, messageId, timestamp}` — the canonical
 * `chat_messages.id` is the dedupe anchor). Pure and unit-testable.
 */

import type { BufferedMessage } from "@/lib/messaging/buffer";
import {
  segmentHistoryByDay,
  type SegmentedMessage,
  type TemporalHistoryEntry,
} from "./temporal-context";

export type HistoryTurn = TemporalHistoryEntry;

/**
 * Merges the persisted history with the in-flight buffered turn so the model
 * sees each customer text exactly once. Buffered ids win over history rows
 * only when the same canonical message id matches — a persisted row with a
 * different id is NOT dropped for containing the same text (an intentional
 * customer re-send must stay visible to the model).
 */
export function dedupeHistoryWithBuffered(
  history: readonly HistoryTurn[],
  buffered: readonly BufferedMessage[],
): HistoryTurn[] {
  const bufferedIds = new Set<string>();
  for (const message of buffered) {
    if (message.messageId) bufferedIds.add(message.messageId);
  }

  const turns: HistoryTurn[] = history
    .filter((turn) => !turn.messageId || !bufferedIds.has(turn.messageId))
    .map((turn) => ({ ...turn }));

  if (buffered.length === 0) return turns;

  const latestBufferedAt = buffered
    .map((message) => new Date(message.timestamp))
    .reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
  const merged = buffered.map((message) => message.content).join("\n");

  turns.push({
    role: "user",
    content: merged,
    createdAt: latestBufferedAt,
    messageId: buffered[buffered.length - 1]?.messageId,
  });

  return turns;
}

/** Segmented history for the agent loop (day-boundary system markers). */
export function buildTemporalAgentMessages(
  history: readonly HistoryTurn[],
  buffered: readonly BufferedMessage[],
): SegmentedMessage[] {
  return segmentHistoryByDay(dedupeHistoryWithBuffered(history, buffered));
}
