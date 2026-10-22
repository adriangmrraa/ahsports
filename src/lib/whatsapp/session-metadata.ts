/**
 * Optimistic compare-and-swap writer for the `metadata` sub-map inside
 * `agent_session_states.state` — the AH equivalent of SocialCRM's
 * `conversations.conversation_metadata` CAS helper.
 *
 * Several subsystems share this map (anti-loop reprompt counters, lifecycle
 * markers, last-tool trace). Unconditional read-modify-write would silently
 * drop each other's fields under concurrency, so the CAS guards on the
 * whole state blob: `state IS NOT DISTINCT FROM <old>::jsonb` (jsonb equality
 * is semantic — key order/whitespace don't matter). A lost race re-reads,
 * re-merges, retries (bounded). Returns false when the session row is missing
 * or retries are exhausted; callers treat metadata persistence as
 * best-effort.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { agentSessionStates } from "@/db/schema";

export const METADATA_CAS_MAX_RETRIES = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function updateSessionMetadataCAS(
  conversationId: string,
  mutate: (current: Record<string, unknown>) => Record<string, unknown>,
): Promise<boolean> {
  for (let attempt = 0; attempt <= METADATA_CAS_MAX_RETRIES; attempt++) {
    const [row] = await db
      .select({ state: agentSessionStates.state })
      .from(agentSessionStates)
      .where(
        and(
          eq(agentSessionStates.conversationId, conversationId),
          eq(agentSessionStates.kind, "customer"),
        ),
      )
      .limit(1);
    if (!row || !isRecord(row.state)) return false;

    const current = row.state;
    const currentMetadata = isRecord(current.metadata) ? current.metadata : {};
    const nextMetadata = mutate({ ...currentMetadata });
    const next = { ...current, metadata: nextMetadata };

    const updated = await db
      .update(agentSessionStates)
      .set({ state: next, updatedAt: new Date() })
      .where(
        and(
          eq(agentSessionStates.conversationId, conversationId),
          eq(agentSessionStates.kind, "customer"),
          sql`${agentSessionStates.state} IS NOT DISTINCT FROM ${JSON.stringify(current)}::jsonb`,
        ),
      );
    // neon-http returns {rowCount}; test fakes return the updated rows array.
    const rowCount = Array.isArray(updated)
      ? updated.length
      : ((updated as unknown as { rowCount?: number }).rowCount ?? 0);
    if (rowCount > 0) return true;
    // Conflict — another writer landed between read and write; retry fresh.
  }
  console.warn("[whatsapp/session-metadata] CAS retries exhausted");
  return false;
}
