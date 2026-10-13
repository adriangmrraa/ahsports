/**
 * Retention & reconcile decision policy (P5).
 *
 * Pure, side-effect-free decisions: which idempotency keys have expired, which
 * conversation raw payloads are past their retention window, which memories have
 * expired and which inbound messages were left without a reply. Keeping this
 * module free of `server-only` / database imports lets the policy be checked
 * without a live connection (see the DB-free behavior check).
 */

export const RECONCILE_DEFAULT_BATCH_SIZE = 100;

/** Inbound/outbound provider payloads may contain PII; scrub after 90 days. */
export const RAW_PAYLOAD_RETENTION_MS = 1000 * 60 * 60 * 24 * 90;

/** Reconcile only looks back this far for inbound messages without a reply. */
export const INBOUND_WITHOUT_REPLY_WINDOW_MS = 1000 * 60 * 60 * 24 * 7;

/** Suppress duplicate no-reply findings for the same conversation for 1 day. */
export const NO_REPLY_AUDIT_DEDUPE_TTL_MS = 1000 * 60 * 60 * 24;

export const AGENT_MEMORY_DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function toMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * A row is expired when it has an expiry and it is strictly before `now`.
 * A null/absent expiry never expires (mirrors `agent_memories.expires_at` and
 * `idempotency_keys.expires_at` being nullable).
 */
export function isExpired(expiresAt: Date | string | null | undefined, now: Date): boolean {
  const ms = toMs(expiresAt);
  return ms !== null && ms < now.getTime();
}

/** True when an old message still carries a raw provider payload to scrub. */
export function shouldScrubRawPayload(
  row: { createdAt: Date | string | null | undefined; rawPayload: unknown },
  now: Date,
  windowMs: number = RAW_PAYLOAD_RETENTION_MS,
): boolean {
  if (row.rawPayload == null) return false;
  const createdMs = toMs(row.createdAt);
  if (createdMs === null) return false;
  return createdMs < now.getTime() - windowMs;
}

export type MessageFact = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  senderKind: "customer" | "agent" | "operator";
  createdAt: Date | string;
};

export type InboundGap = {
  conversationId: string;
  messageId: string;
  senderKind: "customer" | "operator";
  createdAt: Date | string;
  unansweredCount: number;
};

/**
 * Groups messages by conversation and returns, for each conversation, the most
 * recent customer/operator inbound message that has no strictly later outbound
 * reply — plus how many inbound messages in that conversation are unanswered.
 * Conversations whose latest activity is already a reply are not reported.
 */
export function findInboundWithoutReply(messages: readonly MessageFact[]): InboundGap[] {
  const byConversation = new Map<string, MessageFact[]>();
  for (const message of messages) {
    const bucket = byConversation.get(message.conversationId);
    if (bucket) bucket.push(message);
    else byConversation.set(message.conversationId, [message]);
  }

  const gaps: InboundGap[] = [];
  for (const [conversationId, facts] of byConversation) {
    const lastOutboundMs = facts.reduce((max, fact) => {
      if (fact.direction !== "outbound") return max;
      const ms = toMs(fact.createdAt);
      return ms !== null && ms > max ? ms : max;
    }, Number.NEGATIVE_INFINITY);

    const unanswered = facts.filter((fact) => {
      if (fact.direction !== "inbound") return false;
      if (fact.senderKind !== "customer" && fact.senderKind !== "operator") return false;
      const ms = toMs(fact.createdAt);
      return ms !== null && ms > lastOutboundMs;
    });

    if (unanswered.length === 0) continue;

    const latest = unanswered.reduce((a, b) => {
      const aMs = toMs(a.createdAt) ?? 0;
      const bMs = toMs(b.createdAt) ?? 0;
      return bMs > aMs ? b : a;
    });

    gaps.push({
      conversationId,
      messageId: latest.id,
      senderKind: latest.senderKind as "customer" | "operator",
      createdAt: latest.createdAt,
      unansweredCount: unanswered.length,
    });
  }

  return gaps;
}
