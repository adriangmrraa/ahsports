/**
 * First-contact auto-reply primitives (ported from SocialCRM's
 * inbound-pipeline). The enable/message decision is config-driven upstream
 * via the scoped `agent_config.autoReply24h*` columns, resolved by
 * `resolveAgentConfig` — this module keeps only the config-free gate and the
 * durable claim key. Call-site: `maybeSendAutoReply` in inbound-pipeline.
 */

/**
 * `isNew` is the fast path; the message-count check makes a retry after a
 * retryable send failure send again (the conversation row committed, but no
 * inbound/auto-reply message did). `alreadyReplied` is the durable marker
 * that stops a replay once the reply was sent and recorded.
 */
export function shouldSendAutoReply(input: {
  isNew: boolean;
  alreadyReplied: boolean;
  conversationHasMessages: boolean;
}): boolean {
  if (input.alreadyReplied) return false;
  return input.isNew || !input.conversationHasMessages;
}

/**
 * Conversation-scoped claim key for the first-contact auto-reply. The send
 * gate is evaluated before the inbound row exists, so two concurrent first
 * messages can both pass it; this unique platformMessageId makes only one of
 * them reach the send (the second fails the dedup insert).
 */
export function autoReplyClaimKey(conversationId: string): string {
  return `auto-reply:conv:${conversationId}`;
}
