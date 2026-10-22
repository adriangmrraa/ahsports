/**
 * Durable session repository and turn persistence entry points for the
 * customer WhatsApp agent.
 *
 * Port of SocialCRM `src/lib/whatsapp/session-store.ts`, adapted to the AH
 * schema (no `conversation_session_*` tables exist here):
 *
 *  - Session state lives in `agent_session_states.state` (jsonb), keyed by
 *    conversationId with `kind = 'customer'`. The serialized blob carries the
 *    policy fields plus a `metadata` sub-object shared by other writers
 *    (anti-loop), so every writer CAS-guards its own update.
 *  - The unique inbound-event claim rides `idempotency_keys`
 *    (`scope = 'whatsapp.session-event'`, response carries eventType+signal),
 *    30-day TTL. At-most-once delivery semantics are preserved.
 *  - Audit transitions append `agent_session_events` rows.
 *  - `saveTransition` runs claim + CAS + event inside `withDbTransaction`:
 *    a CAS conflict rolls the claim back atomically (no orphan release
 *    needed — strictly tighter than the neon-http version this ports).
 *
 * Any dedup/CAS failure throws so the dispatcher fails closed: no agent run,
 * no automatic customer reply.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agentSessionEvents, agentSessionStates, idempotencyKeys } from "@/db/schema";
import { withDbTransaction } from "@/lib/db-transaction";
import {
  classifyBoundary,
  SessionPolicyService,
  type AssetKind,
  type BoundarySignal,
  type CommercialIntent,
  type ConversationSessionState,
  type PendingQuestion,
  type RoutingDecision,
  type SessionEventType,
  type SessionPolicyRepository,
} from "./session-policy";

const SESSION_CLAIM_SCOPE = "whatsapp.session-event";
const SESSION_CLAIM_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sessionClaimKey(conversationId: string, inboundMessageId: string): string {
  return `sess:${conversationId}:${inboundMessageId}`.slice(0, 255);
}

class CasConflictError extends Error {
  constructor() {
    super("conversation session compare-and-swap conflict");
    this.name = "CasConflictError";
  }
}

type SessionMetadata = Record<string, unknown>;

/**
 * The persisted `state` jsonb shape: policy fields at the top level plus an
 * opaque `metadata` map written via `updateSessionMetadataCAS` (anti-loop
 * counters, lifecycle markers). Writers must preserve unknown subkeys.
 */
type StoredState = {
  conversationId: string;
  version: number;
  policyVersion: number;
  episode: number;
  mode: ConversationSessionState["mode"];
  ackSent: boolean;
  clarificationSent: boolean;
  commercialIntent: CommercialIntent | null;
  pendingQuestion: PendingQuestion | null;
  hasActiveOrder: boolean;
  activeOrderId: string | null;
  hasAddressReference: boolean;
  recentAssetKinds: AssetKind[];
  metadata?: SessionMetadata;
};

function toStoredState(state: ConversationSessionState, metadata: SessionMetadata | undefined): StoredState {
  return {
    conversationId: state.conversationId,
    version: state.version,
    policyVersion: state.policyVersion,
    episode: state.episode,
    mode: state.mode,
    ackSent: state.ackSent,
    clarificationSent: state.clarificationSent,
    commercialIntent: state.commercialIntent,
    pendingQuestion: state.pendingQuestion,
    hasActiveOrder: state.hasActiveOrder,
    activeOrderId: state.activeOrderId,
    hasAddressReference: state.hasAddressReference,
    recentAssetKinds: [...state.recentAssetKinds],
    metadata: metadata ?? {},
  };
}

function isStoredState(value: unknown): value is StoredState {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.version === "number" && typeof v.episode === "number" && typeof v.mode === "string";
}

function fromStoredState(stored: StoredState): ConversationSessionState {
  return {
    conversationId: stored.conversationId,
    version: stored.version,
    policyVersion: stored.policyVersion,
    episode: stored.episode,
    mode: stored.mode,
    ackSent: stored.ackSent === true,
    clarificationSent: stored.clarificationSent === true,
    commercialIntent: (stored.commercialIntent ?? null) as CommercialIntent | null,
    pendingQuestion: (stored.pendingQuestion ?? null) as PendingQuestion | null,
    hasActiveOrder: stored.hasActiveOrder === true,
    activeOrderId: typeof stored.activeOrderId === "string" ? stored.activeOrderId : null,
    hasAddressReference: stored.hasAddressReference === true,
    recentAssetKinds: Array.isArray(stored.recentAssetKinds)
      ? ([...stored.recentAssetKinds] as AssetKind[])
      : [],
  };
}

async function readStoredRow(
  conversationId: string,
): Promise<{ state: ConversationSessionState; metadata: SessionMetadata } | null> {
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
  if (!row || !isStoredState(row.state)) return null;
  const metadata =
    row.state.metadata && typeof row.state.metadata === "object" && !Array.isArray(row.state.metadata)
      ? (row.state.metadata as SessionMetadata)
      : {};
  return { state: fromStoredState(row.state), metadata };
}

export class DrizzleSessionPolicyRepository implements SessionPolicyRepository {
  /**
   * Pass-through BY DESIGN (ported): durable at-most-once semantics come from
   * the unique inbound claim key plus the state-version CAS. A lost race
   * surfaces as `duplicate` (no-op) or `conflict` (throw, webhook aborts with
   * no routing/output). `withDbTransaction` keeps claim+CAS+event atomic.
   */
  async withConversationLock<T>(conversationId: string, work: () => Promise<T>): Promise<T> {
    void conversationId;
    return work();
  }

  async load(conversationId: string): Promise<ConversationSessionState | null> {
    const row = await readStoredRow(conversationId);
    return row?.state ?? null;
  }

  async findEvent(
    conversationId: string,
    inboundMessageId: string,
  ): Promise<{ eventType: SessionEventType; signal: BoundarySignal } | null> {
    const [row] = await db
      .select({ response: idempotencyKeys.response })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.key, sessionClaimKey(conversationId, inboundMessageId)),
          eq(idempotencyKeys.scope, SESSION_CLAIM_SCOPE),
        ),
      )
      .limit(1);
    if (!row?.response) return null;
    const eventType = row.response.eventType;
    const signal = row.response.signal;
    if (typeof eventType !== "string" || typeof signal !== "string") return null;
    return {
      eventType: eventType as SessionEventType,
      signal: signal as BoundarySignal,
    };
  }

  async saveTransition(input: {
    state: ConversationSessionState;
    expectedVersion: number;
    inboundMessageId: string;
    eventType: SessionEventType;
    signal: BoundarySignal;
  }): Promise<"saved" | "duplicate" | "conflict"> {
    const { state } = input;
    try {
      return await withDbTransaction(async (tx) => {
        // 1. Unique inbound claim — at most once per (conversation, message).
        const claimed = await tx
          .insert(idempotencyKeys)
          .values({
            key: sessionClaimKey(state.conversationId, input.inboundMessageId),
            scope: SESSION_CLAIM_SCOPE,
            response: {
              conversationId: state.conversationId,
              eventType: input.eventType,
              signal: input.signal,
            },
            expiresAt: new Date(Date.now() + SESSION_CLAIM_TTL_MS),
          })
          .onConflictDoNothing({ target: idempotencyKeys.key });
        const claimedCount = (claimed as unknown as { rowCount?: number }).rowCount ?? 0;
        if (claimedCount === 0) return "duplicate" as const;

        // 2. Preserve the opaque metadata sub-map written by sibling writers.
        const existing = await tx
          .select({ state: agentSessionStates.state })
          .from(agentSessionStates)
          .where(
            and(
              eq(agentSessionStates.conversationId, state.conversationId),
              eq(agentSessionStates.kind, "customer"),
            ),
          )
          .limit(1);
        const existingMetadata =
          existing[0] && isStoredState(existing[0].state) ? existing[0].state.metadata : undefined;
        const next = toStoredState(state, existingMetadata);

        // 3. CAS the state row: fresh session inserts when missing, otherwise
        //    updates only while the stored version matches the expected one.
        if (input.expectedVersion === 0) {
          const inserted = await tx
            .insert(agentSessionStates)
            .values({
              conversationId: state.conversationId,
              kind: "customer",
              state: next as unknown as Record<string, unknown>,
            })
            .onConflictDoNothing({ target: agentSessionStates.conversationId });
          const insertedCount = (inserted as unknown as { rowCount?: number }).rowCount ?? 0;
          if (insertedCount === 0) throw new CasConflictError();
        } else {
          const updated = await tx
            .update(agentSessionStates)
            .set({ state: next as unknown as Record<string, unknown>, updatedAt: new Date() })
            .where(
              and(
                eq(agentSessionStates.conversationId, state.conversationId),
                eq(agentSessionStates.kind, "customer"),
                sql`(${agentSessionStates.state} ->> 'version')::int = ${input.expectedVersion}`,
              ),
            );
          const updatedCount = (updated as unknown as { rowCount?: number }).rowCount ?? 0;
          if (updatedCount === 0) throw new CasConflictError();
        }

        // 4. Audit event — same transaction as claim + state.
        await tx.insert(agentSessionEvents).values({
          conversationId: state.conversationId,
          eventType: input.eventType,
          payload: {
            episode: state.episode,
            stateVersion: state.version,
            policyVersion: state.policyVersion,
            signal: input.signal,
            inboundMessageId: input.inboundMessageId,
          },
        });
        return "saved" as const;
      });
    } catch (error) {
      if (error instanceof CasConflictError) return "conflict";
      throw error;
    }
  }
}

export type PersistSessionTransitionInput = {
  conversationId: string;
  /** Durable id of the last buffered inbound message (canonical or provider). */
  messageId: string;
  text: string;
  messageType: string;
  aiEnabled: boolean;
  hasHumanOverride: boolean;
  hasActiveOrder?: boolean;
};

/**
 * Evaluates the deterministic boundary policy and persists the eligible
 * transition plus its audit event. Persists even when AI is disabled
 * (delivery is then suppressed). Throws on any dedup/CAS failure so the
 * caller fails closed.
 */
export async function persistSessionTransition(
  input: PersistSessionTransitionInput,
): Promise<RoutingDecision> {
  const signal = classifyBoundary({
    text: input.text,
    messageType: input.messageType,
    hasActiveOrder: input.hasActiveOrder ?? false,
  });
  const service = new SessionPolicyService(new DrizzleSessionPolicyRepository());
  return service.decide(input.conversationId, {
    signal,
    messageId: input.messageId,
    hasHumanOverride: input.hasHumanOverride,
    delivery: input.aiEnabled ? "allowed" : "suppressed",
  });
}

/** Re-reads persisted boundary state (used to revalidate after debounce). */
export async function loadSessionState(
  conversationId: string,
): Promise<ConversationSessionState | null> {
  return new DrizzleSessionPolicyRepository().load(conversationId);
}

/** Reads the opaque metadata sub-map (anti-loop counters, lifecycle markers). */
export async function loadSessionMetadata(conversationId: string): Promise<SessionMetadata> {
  const row = await readStoredRow(conversationId);
  return row?.metadata ?? {};
}
