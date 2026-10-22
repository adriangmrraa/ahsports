/**
 * Inbound scoping keys for buffer, content-dedup, and rate-limit buckets.
 *
 * Port of SocialCRM `src/lib/messaging/inbound-keys.ts`.
 *
 * A bound channel account namespaces the customer key so the same phone
 * messaging two provisioned numbers inside the debounce/rate-limit window
 * never shares a turn, a dedup slot, or a bucket — the first event's binding
 * can no longer answer another account's inbound. A NULL/legacy context keeps
 * the exact legacy `${userId}` key shape byte-for-byte.
 *
 * AH adaptation: `channelAccountId` is a string (AH ids are varchar/uuid-style,
 * and env-materialized accounts carry symbolic ids); SocialCRM used `number`.
 */
export function accountScopedInboundKey(
  channelAccountId: string | null | undefined,
  userId: string
): string {
  return channelAccountId != null && channelAccountId !== ""
    ? `acct${channelAccountId}:${userId}`
    : userId;
}
