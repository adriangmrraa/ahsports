/**
 * Idempotent human-handoff effect claims for the customer WhatsApp agent.
 *
 * Port of SocialCRM `src/lib/whatsapp/human-handoff.ts`, adapted to the AH
 * schema (no `conversation_session_effect_claims` table exists):
 *
 *  - Claims ride `idempotency_keys` (scope `whatsapp.handoff-effect`):
 *      human_override      → `ho:<conv>:<episode>`   (at most once per episode)
 *      owner_notification  → `on:<conv>:<episode>`   (at most once per episode)
 *      customer_reply      → `cr:<conv>:<inbound>`   (at most once per inbound)
 *  - The human-override marker lives in `agent_memories`
 *    (scope `customer`, key `whatsapp-handoff:<conv>`, 24h expiry) — AH
 *    `conversations` has no `human_override_until` column.
 *  - Operator notification fans out to bound Telegram operators
 *    (`agent_memories` scope `operator`, `telegram:<chatId>` keys) through
 *    `sendTelegramMessage`, and audits the outcome truthfully — the customer
 *    is never told "the team was notified" when nothing actually delivered.
 *
 * Only boundary references are stored — never message text, PII, prompts,
 * or media payloads.
 */
import { and, eq, gt, like } from "drizzle-orm";
import { db } from "@/db/client";
import { agentConfig, agentMemories, auditEvents, idempotencyKeys } from "@/db/schema";
import { providerForChannel } from "@/lib/messaging/registry";
import type { ChannelKind } from "@/lib/messaging/types";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { sendTelegramMessage } from "@/lib/channels/telegram";

export type HandoffEffectKind = "human_override" | "owner_notification" | "customer_reply";

export type HandoffClaimInput = {
  conversationId: string;
  episode: number;
  inboundMessageId: string;
  aiEnabled: boolean;
};

export type HandoffClaimResult = {
  overrideClaimed: boolean;
  ownerNotificationClaimed: boolean;
  customerReplyClaimed: boolean;
  /** The owner is always notified on a fresh handoff, even with AI disabled. */
  ownerNotificationDeliverable: boolean;
  /** Customer replies are only delivered when AI is enabled. */
  customerReplyDeliverable: boolean;
};

export type ClaimOutcome = "claimed" | "duplicate";

export interface HandoffEffectRepository {
  claimEffect(input: {
    conversationId: string;
    episode: number;
    effectKind: HandoffEffectKind;
    inboundMessageId: string;
  }): Promise<ClaimOutcome>;
}

export interface HandoffEffectClaimant {
  claimHandoffEffects(input: HandoffClaimInput): Promise<HandoffClaimResult>;
}

const HANDOFF_EFFECT_SCOPE = "whatsapp.handoff-effect";
const HANDOFF_CLAIM_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const HUMAN_OVERRIDE_TTL_MS = 24 * 60 * 60 * 1000;
const HUMAN_OVERRIDE_KEY_PREFIX = "whatsapp-handoff";

function handoffClaimKey(input: {
  conversationId: string;
  episode: number;
  effectKind: HandoffEffectKind;
  inboundMessageId: string;
}): string {
  // Episode-scoped claims: at most one override / notification per episode.
  // Inbound-scoped claim: at most one customer reply per inbound message.
  const raw =
    input.effectKind === "customer_reply"
      ? `cr:${input.conversationId}:${input.inboundMessageId}`
      : `${input.effectKind === "human_override" ? "ho" : "on"}:${input.conversationId}:${input.episode}`;
  return raw.slice(0, 255);
}

function overrideMemoryKey(conversationId: string): string {
  return `${HUMAN_OVERRIDE_KEY_PREFIX}:${conversationId}`.slice(0, 255);
}

const HANDOFF_EFFECTS: readonly HandoffEffectKind[] = [
  "human_override",
  "owner_notification",
  "customer_reply",
];

/** Pure delivery gate: a claimed customer reply may only go out when AI is enabled. */
export function resolveHandoffDelivery(input: { aiEnabled: boolean; replyClaimed: boolean }): boolean {
  return input.aiEnabled && input.replyClaimed;
}

export type HandoffTransportInput = {
  notifyClaim: boolean;
  replyClaim: boolean;
  delivery: "allowed" | "suppressed";
  /** Conversation channel the decision is computed for (whatsapp default). */
  channel?: ChannelKind;
};

export type HandoffTransportKind =
  | "messenger"
  | "internal-bot"
  | "unavailable";

export type HandoffTransportDecision = {
  writeOverride: boolean;
  sendOwnerNotification: boolean;
  sendCustomerReply: boolean;
  channel: ChannelKind;
  transport: HandoffTransportKind;
};

/**
 * Pure handoff-transport gate (ported verbatim): claims are at-most-once per
 * episode/message; the transport follows the same rule — a duplicate claim
 * transports nothing. The owner side stays deliverable even with AI disabled;
 * the customer reply stays suppressed until AI is enabled.
 */
export function resolveHandoffTransport(input: HandoffTransportInput): HandoffTransportDecision {
  const channel = input.channel ?? "whatsapp";
  const transport: HandoffTransportKind =
    channel === "telegram"
      ? "internal-bot"
      : providerForChannel(channel)
        ? "messenger"
        : "unavailable";
  return {
    writeOverride: input.notifyClaim,
    sendOwnerNotification: input.notifyClaim,
    sendCustomerReply:
      input.replyClaim && input.delivery === "allowed" && transport !== "unavailable",
    channel,
    transport,
  };
}

export class HandoffEffectService implements HandoffEffectClaimant {
  constructor(private readonly repository: HandoffEffectRepository) {}

  async claimHandoffEffects(input: HandoffClaimInput): Promise<HandoffClaimResult> {
    const claimed = new Map<HandoffEffectKind, boolean>();
    for (const effectKind of HANDOFF_EFFECTS) {
      claimed.set(
        effectKind,
        (await this.repository.claimEffect({
          conversationId: input.conversationId,
          episode: input.episode,
          effectKind,
          inboundMessageId: input.inboundMessageId,
        })) === "claimed",
      );
    }
    const customerReplyClaimed = claimed.get("customer_reply") ?? false;
    const ownerNotificationClaimed = claimed.get("owner_notification") ?? false;
    return {
      overrideClaimed: claimed.get("human_override") ?? false,
      ownerNotificationClaimed,
      customerReplyClaimed,
      ownerNotificationDeliverable: ownerNotificationClaimed,
      customerReplyDeliverable: resolveHandoffDelivery({
        aiEnabled: input.aiEnabled,
        replyClaimed: customerReplyClaimed,
      }),
    };
  }
}

export class DrizzleHandoffEffectRepository implements HandoffEffectRepository {
  async claimEffect(input: {
    conversationId: string;
    episode: number;
    effectKind: HandoffEffectKind;
    inboundMessageId: string;
  }): Promise<ClaimOutcome> {
    const inserted = await db
      .insert(idempotencyKeys)
      .values({
        key: handoffClaimKey(input),
        scope: HANDOFF_EFFECT_SCOPE,
        response: {
          conversationId: input.conversationId,
          episode: input.episode,
          effectKind: input.effectKind,
          inboundMessageId: input.inboundMessageId,
        },
        expiresAt: new Date(Date.now() + HANDOFF_CLAIM_TTL_MS),
      })
      .onConflictDoNothing({ target: idempotencyKeys.key });
    const rowCount = (inserted as unknown as { rowCount?: number }).rowCount ?? 0;
    return rowCount > 0 ? "claimed" : "duplicate";
  }
}

// ─── Human override marker (agent_memories, 24h) ─────────────────────────────

export async function activateHumanOverride(
  conversationId: string,
  episode: number,
): Promise<void> {
  const key = overrideMemoryKey(conversationId);
  await db
    .insert(agentMemories)
    .values({
      scope: "customer",
      key,
      value: { episode, activatedAt: new Date().toISOString() },
      expiresAt: new Date(Date.now() + HUMAN_OVERRIDE_TTL_MS),
    })
    .onConflictDoUpdate({
      target: [agentMemories.scope, agentMemories.key],
      set: {
        value: { episode, activatedAt: new Date().toISOString() },
        expiresAt: new Date(Date.now() + HUMAN_OVERRIDE_TTL_MS),
      },
    });
}

export async function isHumanOverrideActive(conversationId: string): Promise<boolean> {
  const [row] = await db
    .select({ key: agentMemories.key })
    .from(agentMemories)
    .where(
      and(
        eq(agentMemories.scope, "customer"),
        eq(agentMemories.key, overrideMemoryKey(conversationId)),
        gt(agentMemories.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row !== undefined;
}

// ─── Operator notification ───────────────────────────────────────────────────

export type HandoffNotifyInput = {
  conversationId: string;
  customerName?: string;
  reason?: string;
  summary?: string;
};

export type HandoffNotifyResult = {
  notified: boolean;
  attempted: number;
  delivered: number;
};

/**
 * Notifies bound Telegram operators. Bound identities are `agent_memories`
 * rows (scope `operator`, key `telegram:<chatId>`) written by
 * `bindOperatorIdentity`. The bot token resolves from the telegram-scoped
 * (or legacy global) `agent_config.botTokenEnc`. Returns a truthful delivery
 * count — callers must not claim "the team was notified" on zero delivered.
 */
export async function notifyHandoffOperators(input: HandoffNotifyInput): Promise<HandoffNotifyResult> {
  const bindings = await db
    .select({ key: agentMemories.key })
    .from(agentMemories)
    .where(and(eq(agentMemories.scope, "operator"), like(agentMemories.key, "telegram:%")));

  const text = [
    "🔔 Derivación a humano — WhatsApp",
    `Conversación: ${input.conversationId}`,
    input.customerName ? `Cliente: ${input.customerName}` : null,
    input.reason ? `Motivo: ${input.reason}` : null,
    input.summary ? `Resumen: ${input.summary}` : null,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1500);

  let botToken = "";
  const [scoped] = await db
    .select({ botTokenEnc: agentConfig.botTokenEnc })
    .from(agentConfig)
    .where(eq(agentConfig.channel, "telegram"))
    .limit(1);
  if (scoped?.botTokenEnc) {
    botToken = decryptSecret(scoped.botTokenEnc);
  }
  if (!botToken) {
    const [globalRow] = await db
      .select({ botTokenEnc: agentConfig.botTokenEnc })
      .from(agentConfig)
      .where(eq(agentConfig.id, 1))
      .limit(1);
    if (globalRow?.botTokenEnc) botToken = decryptSecret(globalRow.botTokenEnc);
  }

  let attempted = 0;
  let delivered = 0;
  if (botToken) {
    for (const binding of bindings) {
      const chatId = binding.key.slice("telegram:".length);
      if (!chatId) continue;
      attempted += 1;
      const result = await sendTelegramMessage(botToken, chatId, text);
      if (result.ok) delivered += 1;
    }
  }

  await db.insert(auditEvents).values({
    actorKind: "system",
    action: "whatsapp.handoff.owner_notified",
    entityType: "conversation",
    entityId: input.conversationId,
    payload: {
      after: {
        attempted,
        delivered,
        bindings: bindings.length,
        botTokenConfigured: Boolean(botToken),
      },
    },
  });

  return { notified: delivered > 0, attempted, delivered };
}
