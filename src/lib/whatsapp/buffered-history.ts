/**
 * History/buffer reconciliation for the customer WhatsApp agent.
 *
 * Port of SocialCRM `src/lib/whatsapp/buffered-history.ts`.
 *
 * AH adaptation: `BufferedMessage.messageId` in `src/lib/messaging/types.ts`
 * carries the canonical `chat_messages.id` (the durable row id), not the
 * provider message id. `TemporalHistoryEntry.messageId` therefore matches on
 * the canonical id first (provider id kept as a secondary anchor so both
 * shapes dedupe correctly). Pure and unit-testable.
 */

import type { BufferedMessage } from "@/lib/messaging/types";
import {
  segmentHistoryByDay,
  type SegmentedMessage,
  type TemporalHistoryEntry,
} from "./temporal-context";

export type HistoryTurn = TemporalHistoryEntry;

/**
 * Merges the persisted history with the in-flight buffered turn so the model
 * sees each customer text exactly once. Buffered texts win over history rows
 * only when the same canonical message id matches — a persisted row with a
 * different id is NOT dropped for containing the same text (an intentional
 * customer re-send must stay visible to the model).
 */
export function dedupeHistoryWithBuffered(
  history: readonly HistoryTurn[],
  buffered: readonly BufferedMessage[],
): HistoryTurn[] {
  const bufferedIds = new Set<string>();
  const bufferedPlatformIds = new Set<string>();
  for (const message of buffered) {
    if (message.messageId) bufferedIds.add(message.messageId);
    if (message.providerMessageId) bufferedPlatformIds.add(message.providerMessageId);
  }

  const turns: HistoryTurn[] = history
    .filter((turn) => {
      if (turn.messageId && bufferedIds.has(turn.messageId)) return false;
      if (turn.platformMessageId && bufferedPlatformIds.has(turn.platformMessageId)) {
        return false;
      }
      return true;
    })
    .map((turn) => ({ ...turn }));

  if (buffered.length === 0) return turns;

  const latestBufferedAt = buffered
    .map((message) => (message.receivedAt instanceof Date ? message.receivedAt : new Date()))
    .reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
  const merged = buffered.map((message) => message.content).join("\n");

  turns.push({
    role: "user",
    content: merged,
    createdAt: latestBufferedAt,
    messageId: buffered[buffered.length - 1]?.messageId,
    platformMessageId: buffered[buffered.length - 1]?.providerMessageId,
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
