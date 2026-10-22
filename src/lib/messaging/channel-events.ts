import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { idempotencyKeys } from "@/db/schema";

import type { ChannelAccount, ChannelKind, NormalizedInboundEvent } from "./types";

/**
 * Channel event persistence — the durable record of every verified provider
 * delivery, keyed for dedup before message processing runs.
 *
 * SocialCRM stores these in a dedicated `channel_events` table. This worktree
 * shares its schema with the parallel `ah-channel-accounts` wave, which owns
 * `src/db/**` — so the durable store here is `idempotency_keys` (unbounded
 * key space, insert-if-absent via PK conflict, `expiresAt: null` survives the
 * reconcile purge that deletes only expired keys). The event row lives in the
 * `response` jsonb, so nothing is lost when the real table lands.
 *
 * Dedup contract mirrors the source:
 * - key = `provider:delivery:<deliveryId>` when the adapter supplies a
 *   delivery id (replay protection across redeliveries of the same envelope)
 * - key = `provider:platform:<platformMessageId>:<kind>:<status>` for
 *   id-less deliveries (stable so identical retries dedup, distinct events
 *   with the same message id but different kinds/statuses do not collapse)
 * - account partition: `acct<channelAccountId>` vs `acct-` — a bound account
 *   and the legacy env placeholder never collide on the same delivery id.
 */

const CHANNEL_EVENT_SCOPE = "messaging.channel-events";
const KEY_PREFIX = "messaging.channel-event:";

/** Deterministic dedup key for an event (within one account partition). */
export function channelEventKey(event: NormalizedInboundEvent): string {
  const provider = event.provider;
  const deliveryId = event.deliveryId?.trim();
  if (deliveryId) return `${provider}:delivery:${deliveryId}`;
  const pmid = event.platformMessageId?.trim() || "none";
  return `${provider}:platform:${pmid}:${event.kind}:${event.status ?? "none"}`;
}

function accountPartition(channelAccountId: string | null): string {
  return channelAccountId ? `acct${channelAccountId}` : "acct-";
}

function storageKey(channelAccountId: string | null, eventKey: string): string {
  return `${KEY_PREFIX}${accountPartition(channelAccountId)}:${eventKey}`;
}

/**
 * Storage key for a delivery-level marker (the claim checked by
 * `isChannelDeliveryRecorded` and released by `releaseChannelDeliveryMarker`).
 * Exported for tests; callers use the helpers below.
 */
export function deliveryMarkerKey(
  provider: string,
  deliveryId: string,
  channelAccountId: string | null
): string {
  return storageKey(channelAccountId, `${provider}:delivery:${deliveryId}`);
}

export interface ChannelEventContext {
  channel: ChannelKind;
  account: ChannelAccount;
  /** AH `channel_accounts.id` is a varchar uuid — undefined for env placeholders. */
  channelAccountId?: string;
}

/** Row payload persisted inside `idempotency_keys.response`. */
export interface ChannelEventInsert {
  provider: string;
  channel: string;
  channelAccountId: string | null;
  providerAccountId: string | null;
  deliveryId: string;
  platformMessageId: string | null;
  kind: string;
  direction: string | null;
  status: string | null;
  eventTimestamp: string | null;
  payload: Record<string, unknown>;
  eventKey: string;
  tenantId: string | null;
}

export function toChannelEventInsert(
  event: NormalizedInboundEvent,
  ctx: ChannelEventContext
): ChannelEventInsert {
  return {
    provider: event.provider,
    channel: ctx.channel,
    channelAccountId: ctx.channelAccountId ?? null,
    providerAccountId: event.providerAccountId ?? ctx.account.providerAccountId ?? null,
    deliveryId: event.deliveryId,
    platformMessageId: event.platformMessageId ?? null,
    kind: event.kind,
    direction: event.direction ?? null,
    status: event.status ?? null,
    eventTimestamp: event.timestamp ?? null,
    payload: (event.raw ?? {}) as Record<string, unknown>,
    eventKey: channelEventKey(event),
    tenantId: ctx.account.tenantId ?? null,
  };
}

/**
 * Storage seam. The default is the Drizzle/idempotency_keys implementation;
 * tests (and the future `channel_events` migration) can substitute the
 * function reference. Returns the kind of write that happened so callers can
 * branch on duplicates without string-parsing.
 */
export type ChannelEventPersistResult =
  | { kind: "persisted" }
  | { kind: "duplicate" }
  /**
   * Kept for contract parity with SocialCRM: there a missing `channel_events`
   * table degraded to this ack. In AH the idempotency_keys store always
   * exists, so nothing emits this kind — it remains so the upstream call
   * sites port unchanged.
   */
  | { kind: "schema-not-ready" };

export interface ChannelEventRepository {
  insert(row: ChannelEventInsert): Promise<"inserted" | "duplicate">;
}

export const drizzleChannelEventRepository: ChannelEventRepository = {
  async insert(row) {
    const [inserted] = await db
      .insert(idempotencyKeys)
      .values({
        key: storageKey(row.channelAccountId, row.eventKey),
        scope: CHANNEL_EVENT_SCOPE,
        response: { ...row },
        // expiresAt: null — channel events are a permanent delivery log, not
        // a replay cache; the reconcile purge deletes only expired keys.
      })
      .onConflictDoNothing({ target: idempotencyKeys.key })
      .returning({ key: idempotencyKeys.key });
    return inserted ? "inserted" : "duplicate";
  },
};

export async function persistChannelEvent(
  event: NormalizedInboundEvent,
  ctx: ChannelEventContext,
  repository: ChannelEventRepository = drizzleChannelEventRepository
): Promise<ChannelEventPersistResult> {
  const row = toChannelEventInsert(event, ctx);
  const result = await repository.insert(row);
  return { kind: result === "inserted" ? "persisted" : "duplicate" };
}

/**
 * True when a delivery-level marker already exists for this
 * (provider, deliveryId, account) triple — used by the passive path to dedup
 * before any message write.
 */
export async function isChannelDeliveryRecorded(
  provider: string,
  deliveryId: string,
  channelAccountId: string | null
): Promise<boolean> {
  const [row] = await db
    .select({ key: idempotencyKeys.key })
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.scope, CHANNEL_EVENT_SCOPE),
        eq(idempotencyKeys.key, deliveryMarkerKey(provider, deliveryId, channelAccountId))
      )
    )
    .limit(1);
  return !!row;
}

/**
 * Release a claimed delivery marker after a failed persistence, so the
 * provider's redelivery can claim it again. Without the release, a crash
 * between claim and insert would turn every retry into a permanent skip —
 * the exact message loss the claim was added to prevent. Best-effort: a
 * failed release keeps the marker claimed (fail-safe against double
 * persistence).
 */
export async function releaseChannelDeliveryMarker(
  provider: string,
  deliveryId: string,
  channelAccountId: string | null
): Promise<void> {
  try {
    await db
      .delete(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.scope, CHANNEL_EVENT_SCOPE),
          eq(
            idempotencyKeys.key,
            deliveryMarkerKey(provider, deliveryId, channelAccountId)
          )
        )
      );
  } catch (error) {
    console.warn(
      `[ingress] delivery marker release failed for ${provider}/${deliveryId}`,
      error
    );
  }
}

/**
 * A claim is a marker insert where the event's own eventKey IS the delivery
 * marker (every deliveryId-bearing event). For id-less events the platform
 * key still dedups replays of the identical payload, and the companion
 * delivery marker can't exist (no delivery id to claim).
 */
export async function claimChannelDelivery(
  event: NormalizedInboundEvent,
  ctx: ChannelEventContext,
  repository: ChannelEventRepository = drizzleChannelEventRepository
): Promise<ChannelEventPersistResult> {
  return persistChannelEvent(event, ctx, repository);
}
