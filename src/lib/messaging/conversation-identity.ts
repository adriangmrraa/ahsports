/**
 * Account-aware conversation identity (ported from SocialCRM).
 *
 * A conversation identity is (channel, channel_account_id, canonical external
 * user id). Legacy rows (no account stamp) keep the pre-multi-account
 * (channel, canonical external user id) identity in the NULL partition; the
 * canonical external user id is what gets stored in `external_thread_id`.
 *
 * Safety rules (unchanged from source):
 * - A bound account never adopts a legacy null-account row; it creates its own
 *   scoped row. Legacy history is left untouched.
 * - Two provisioned accounts may hold the same customer id; they never share a
 *   row and a request for account B never returns account A's conversation.
 * - Concurrent creates converge through the unique indexes: the loser re-reads
 *   the winner instead of failing the webhook.
 */

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { conversations } from "@/db/schema";
import type { Channel as PersistableChannel } from "@/lib/channels/types";

import { normalizePhone } from "./phone";
import { isChannelKind } from "./registry";
import type { ChannelKind } from "./types";

const PHONE_CHANNELS = new Set<ChannelKind>(["whatsapp", "telegram", "sms"]);
const PHONE_SHAPED = /^[+\d\s().-]+$/;

/**
 * Channels whose customer identity is a phone number — `contacts.phone`
 * remains their primary lead key. Social channels (instagram/facebook) key
 * leads through the future `lead_identities` table instead
 * (see `lead-identity.ts`).
 */
export function isPhoneChannel(channel: ChannelKind): boolean {
  return PHONE_CHANNELS.has(channel);
}

/**
 * Canonical identity key: digits for phone-shaped values on phone channels,
 * the trimmed raw id otherwise. A non-phone value (BSUID-only identity under
 * Meta phone-hiding, social handle) must NOT be digit-stripped — stripping
 * collapses distinct customers into "" or shared fragments.
 */
export function canonicalExternalUserId(
  channel: ChannelKind,
  value: string
): string {
  const trimmed = value.trim();
  if (PHONE_CHANNELS.has(channel) && PHONE_SHAPED.test(trimmed)) {
    return normalizePhone(trimmed);
  }
  return trimmed;
}

export interface ConversationIdentityRecord {
  id: string;
  channel: ChannelKind;
  channelAccountId: string | null;
}

export interface ConversationIdentityInsert {
  channel: ChannelKind;
  channelAccountId: string | null;
  externalUserId: string;
  externalUserIdNormalized: string;
  customerName?: string | null;
  customerPhone?: string | null;
}

export type IdentityInsertResult =
  | { kind: "inserted"; record: ConversationIdentityRecord }
  | { kind: "conflict" };

export interface ConversationIdentityRepository {
  find(
    channel: ChannelKind,
    channelAccountId: string | null,
    normalizedExternalUserId: string,
    /** Raw identity, used only for a legacy null-account fallback. */
    externalUserId?: string
  ): Promise<ConversationIdentityRecord | null>;
  insert(input: ConversationIdentityInsert): Promise<IdentityInsertResult>;
}

export type ConversationIdentityErrorCode =
  | "stale-account-mismatch"
  | "conflict-unresolved";

export class ConversationIdentityError extends Error {
  readonly code: ConversationIdentityErrorCode;

  constructor(code: ConversationIdentityErrorCode, message: string) {
    super(message);
    this.name = "ConversationIdentityError";
    this.code = code;
  }
}

export interface ConversationIdentityResult {
  record: ConversationIdentityRecord;
  isNew: boolean;
  normalizedExternalUserId: string;
}

/**
 * Finds or creates the conversation for an exact account scope. Never mutates a
 * legacy row and never returns a conversation owned by another account.
 */
export async function resolveConversationIdentity(
  repo: ConversationIdentityRepository,
  input: {
    channel: ChannelKind;
    externalUserId: string;
    channelAccountId: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
  }
): Promise<ConversationIdentityResult> {
  const normalized = canonicalExternalUserId(
    input.channel,
    input.externalUserId
  );
  const accountId = input.channelAccountId ?? null;

  const existing = await repo.find(
    input.channel,
    accountId,
    normalized,
    input.externalUserId
  );
  if (existing) {
    assertConversationAccount(existing, accountId);
    return { record: existing, isNew: false, normalizedExternalUserId: normalized };
  }

  const inserted = await repo.insert({
    channel: input.channel,
    channelAccountId: accountId,
    externalUserId: input.externalUserId,
    externalUserIdNormalized: normalized,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
  });
  if (inserted.kind === "inserted") {
    return {
      record: inserted.record,
      isNew: true,
      normalizedExternalUserId: normalized,
    };
  }

  // Unique-index race: another request inserted the same identity first.
  const raced = await repo.find(
    input.channel,
    accountId,
    normalized,
    input.externalUserId
  );
  if (raced) {
    assertConversationAccount(raced, accountId);
    return { record: raced, isNew: false, normalizedExternalUserId: normalized };
  }
  throw new ConversationIdentityError(
    "conflict-unresolved",
    `conversation identity conflict for channel '${input.channel}'`
  );
}

/**
 * Echo/send guard: the loaded conversation must belong to the account the
 * caller resolved. A present-but-different binding is a hard failure, never a
 * rebind or a fallback to another sender.
 */
export function assertConversationAccount(
  record: ConversationIdentityRecord,
  expectedChannelAccountId: string | null
): void {
  if (record.channelAccountId !== (expectedChannelAccountId ?? null)) {
    throw new ConversationIdentityError(
      "stale-account-mismatch",
      `conversation #${record.id} belongs to account ` +
        `${record.channelAccountId ?? "legacy"}, not ${expectedChannelAccountId ?? "legacy"}`
    );
  }
}

/**
 * Default repository over `conversations`, scoped to the exact account
 * partition the unique indexes enforce: bound rows live under
 * (channel, channel_account_id, external_thread_id) and legacy rows under
 * (channel, external_thread_id) where channel_account_id IS NULL. `find`
 * only resolves inside the caller's partition — a bound account never sees
 * a legacy row, and never another account's row. `insert` stamps
 * channel_account_id so bound echoes satisfy `assertConversationAccount`.
 * Non-enum channels (`instagram`/`facebook`/`sms`) cannot persist until the
 * enum extends — callers gate those before reaching here.
 */
export const drizzleConversationIdentityRepository: ConversationIdentityRepository = {
  async find(channel, channelAccountId, normalizedExternalUserId, externalUserId) {
    const candidates = externalUserId && externalUserId !== normalizedExternalUserId
      ? [normalizedExternalUserId, externalUserId]
      : [normalizedExternalUserId];
    const accountId = channelAccountId ?? null;
    const [row] = await db
      .select({
        id: conversations.id,
        channel: conversations.channel,
        channelAccountId: conversations.channelAccountId,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.channel, channel as PersistableChannel),
          accountId === null
            ? isNull(conversations.channelAccountId)
            : eq(conversations.channelAccountId, accountId),
          inArray(conversations.externalThreadId, candidates)
        )
      )
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      channel: isChannelKind(row.channel) ? row.channel : channel,
      channelAccountId: row.channelAccountId ?? null,
    };
  },

  async insert(input) {
    const accountId = input.channelAccountId ?? null;
    const [inserted] = await db
      .insert(conversations)
      .values({
        channel: input.channel as PersistableChannel,
        channelAccountId: accountId,
        externalThreadId: input.externalUserIdNormalized,
        lastMessageAt: new Date(),
      })
      // No arbiter needed: the two partial uniques partition identity by
      // account scope (bound rows vs. legacy NULL rows), exactly like the
      // message-level dedup in canonical intake.
      .onConflictDoNothing()
      .returning({ id: conversations.id });
    if (!inserted) return { kind: "conflict" };
    return {
      kind: "inserted",
      record: {
        id: inserted.id,
        channel: input.channel,
        channelAccountId: accountId,
      },
    };
  },
};
