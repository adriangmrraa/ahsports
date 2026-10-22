import { normalizePhone } from "./phone";
import type { Channel } from "./types";

/**
 * Account-aware conversation identity.
 *
 * A conversation identity is (channel, channel_account_id, canonical external
 * thread id). Legacy rows (channel_account_id IS NULL) keep the pre-migration
 * (channel, external_thread_id) identity.
 *
 * Safety rules:
 * - A bound account never adopts a legacy null-account row; it creates its own
 *   scoped row. Legacy history is left untouched.
 * - Two provisioned accounts may hold the same customer thread id; they never
 *   share a row and a request for account B never returns account A's
 *   conversation.
 * - Concurrent creates converge through the partial unique indexes: the loser
 *   re-reads the winner instead of failing the webhook.
 */

const PHONE_CHANNELS = new Set<Channel>(["whatsapp", "telegram", "sms"]);
const PHONE_SHAPED = /^[+\d\s().-]+$/;

/**
 * Channels whose customer identity is a phone number — `contacts.phone`
 * remains their primary contact key. Social channels (instagram/facebook/
 * reddit) key contacts through `lead_identities` instead (see
 * `lead-identity.ts`).
 */
export function isPhoneChannel(channel: Channel): boolean {
  return PHONE_CHANNELS.has(channel);
}

/**
 * Canonical identity key: digits for phone-shaped values on phone channels,
 * the trimmed raw id otherwise. A non-phone value (social handle, provider
 * opaque id) must NOT be digit-stripped — stripping collapses distinct
 * customers into "" or shared fragments.
 */
export function canonicalExternalUserId(
  channel: Channel,
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
  channel: Channel;
  channelAccountId: string | null;
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

/**
 * Echo/send guard: the loaded conversation must belong to the account the
 * caller resolved. A present-but-different binding is a hard failure, never a
 * rebind or a fallback to another sender.
 */
export function assertConversationAccount(
  record: Pick<ConversationIdentityRecord, "id" | "channelAccountId">,
  expectedChannelAccountId: string | null
): void {
  if (record.channelAccountId !== (expectedChannelAccountId ?? null)) {
    throw new ConversationIdentityError(
      "stale-account-mismatch",
      `conversation '${record.id}' belongs to account ` +
        `${record.channelAccountId ?? "legacy"}, not ${expectedChannelAccountId ?? "legacy"}`
    );
  }
}
