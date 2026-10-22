import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { channelEvents } from "@/db/schema";

import { isSchemaNotReady } from "./errors";
import type { Channel, ChannelAccount } from "./types";

/**
 * Durable channel events for normalized kinds that have no conversation row
 * (delivery status transitions, account lifecycle, other). Idempotent on the
 * account-scoped provider delivery id, with a secondary
 * platform-message/kind/status key.
 *
 * Only a positively identified missing schema may degrade to "ack without
 * persistence"; any other failure is surfaced (retryable) by the caller.
 */

/** Normalized provider envelope — the seam the provider layer delivers. */
export interface ChannelEventEnvelope {
  provider: string;
  providerAccountId?: string;
  deliveryId: string;
  platformMessageId?: string;
  kind: string;
  direction: string;
  status?: string;
  /** ISO timestamp as reported by the provider. */
  timestamp: string;
  raw: unknown;
}

export interface ChannelEventContext {
  channel: Channel;
  account?: ChannelAccount;
  channelAccountId?: string;
}

export interface ChannelEventInsert {
  tenantId: string;
  provider: string;
  channel: Channel | null;
  channelAccountId: string | null;
  providerAccountId: string | null;
  deliveryId: string;
  platformMessageId: string | null;
  kind: string;
  direction: string;
  status: string | null;
  eventTimestamp: Date | null;
  payload: unknown;
  eventKey: string;
}

export type ChannelEventPersistResult =
  | { kind: "persisted" }
  | { kind: "duplicate" }
  | { kind: "schema-not-ready"; error: unknown };

export interface ChannelEventRepository {
  insert(input: ChannelEventInsert): Promise<"inserted" | "duplicate">;
}

export function channelEventKey(
  event: Pick<ChannelEventEnvelope, "provider" | "deliveryId" | "platformMessageId" | "kind" | "status">
): string {
  if (event.deliveryId) return `${event.provider}:delivery:${event.deliveryId}`;
  return `${event.provider}:platform:${event.platformMessageId ?? "none"}:${event.kind}:${event.status ?? "none"}`;
}

function eventTimestamp(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toChannelEventInsert(
  event: ChannelEventEnvelope,
  ctx: ChannelEventContext
): ChannelEventInsert {
  return {
    tenantId: ctx.account?.tenantId ?? "default",
    provider: event.provider,
    channel: ctx.channel ?? null,
    channelAccountId: ctx.channelAccountId ?? ctx.account?.id ?? null,
    providerAccountId: event.providerAccountId || null,
    deliveryId: event.deliveryId,
    platformMessageId: event.platformMessageId ?? null,
    kind: event.kind,
    direction: event.direction,
    status: event.status ?? null,
    eventTimestamp: eventTimestamp(event.timestamp),
    payload: event.raw,
    eventKey: channelEventKey(event),
  };
}

/** Pure persistence flow over an injected repository (testable without a DB). */
export async function persistChannelEventWithRepo(
  repo: ChannelEventRepository,
  event: ChannelEventEnvelope,
  ctx: ChannelEventContext
): Promise<ChannelEventPersistResult> {
  try {
    const outcome = await repo.insert(toChannelEventInsert(event, ctx));
    return outcome === "inserted" ? { kind: "persisted" } : { kind: "duplicate" };
  } catch (error) {
    if (isSchemaNotReady(error)) return { kind: "schema-not-ready", error };
    throw error;
  }
}

/**
 * Delivery-level read seam for message kinds: chat_messages dedups on
 * `platformMessageId` only, so an id-less message redelivered under a new
 * delivery id would persist twice. channel_events is the only durable store
 * keyed on (provider, account, deliveryId) — this check plus a marker write
 * after persistence closes that gap. Positively identified missing schema
 * degrades to "not recorded" (platformMessageId stays the only key).
 *
 * The read MUST mirror the uniqueness partition:
 * `(provider, coalesce(channel_account_id, ''), delivery_id)`. A marker is
 * only authoritative inside its own account; a NULL/legacy marker stays in
 * the dedicated `''` partition. Reading provider-wide would let account A's
 * marker suppress account B's identical provider delivery id.
 */
export async function isChannelDeliveryRecorded(
  provider: string,
  deliveryId: string,
  channelAccountId: string | null = null
): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: channelEvents.id })
      .from(channelEvents)
      .where(
        and(
          eq(channelEvents.provider, provider),
          sql`coalesce(${channelEvents.channelAccountId}, '') = coalesce(${sql.param(channelAccountId)}, '')`,
          eq(channelEvents.deliveryId, deliveryId)
        )
      )
      .limit(1);
    return rows.length > 0;
  } catch (error) {
    if (isSchemaNotReady(error)) return false;
    throw error;
  }
}

class DrizzleChannelEventRepository implements ChannelEventRepository {
  async insert(input: ChannelEventInsert): Promise<"inserted" | "duplicate"> {
    const rows = await db
      .insert(channelEvents)
      .values({
        tenantId: input.tenantId,
        provider: input.provider,
        channel: input.channel,
        channelAccountId: input.channelAccountId,
        providerAccountId: input.providerAccountId,
        deliveryId: input.deliveryId,
        platformMessageId: input.platformMessageId,
        kind: input.kind,
        direction: input.direction,
        status: input.status,
        eventTimestamp: input.eventTimestamp,
        payload: input.payload as Record<string, unknown>,
      })
      .onConflictDoNothing()
      .returning({ id: channelEvents.id });
    return rows.length > 0 ? "inserted" : "duplicate";
  }
}

export async function persistChannelEvent(
  event: ChannelEventEnvelope,
  ctx: ChannelEventContext
): Promise<ChannelEventPersistResult> {
  return persistChannelEventWithRepo(
    new DrizzleChannelEventRepository(),
    event,
    ctx
  );
}
