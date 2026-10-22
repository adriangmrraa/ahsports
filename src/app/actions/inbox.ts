"use server";

import { z } from "zod";
import { requireAgentAdmin } from "@/lib/agent/rbac";
import { queryMessagesPage, type MessagePage } from "@/lib/agent/inbox";
import { channelSchema } from "@/lib/channels/types";
import {
  normalizeAccountParam,
  type InboxConversationPage,
} from "@/app/(admin)/admin/agent/inbox/filters";
import { queryInboxConversationsPage } from "@/app/(admin)/admin/agent/inbox/queries";

/**
 * G3 — paginated reads for the agent inbox.
 *
 * Thin, authorization-gated wrappers around the cursor queries: the client
 * components call these to fetch the next page as the operator scrolls. Every
 * call re-checks `requireAgentAdmin()`; authorization is never weakened.
 *
 * `channel` accepts the full channel enum; `account` is `all` (default),
 * `unassigned` (legacy rows with channel_account_id IS NULL) or a
 * channel_accounts UUID — normalized to a filter before SQL, never coerced.
 */

const isoDateTime = z.string().datetime();

const conversationsInputSchema = z.object({
  q: z.string().trim().max(200).optional(),
  channel: channelSchema.optional(),
  account: z.string().trim().max(64).optional(),
  cursor: z
    .object({ lastMessageAt: isoDateTime.nullable(), id: z.string().min(1).max(64) })
    .nullable()
    .optional(),
});

const messagesInputSchema = z.object({
  conversationId: z.string().min(1).max(64),
  cursor: z.object({ createdAt: isoDateTime, id: z.string().min(1).max(64) }).nullable().optional(),
});

export async function loadConversations(input: unknown): Promise<InboxConversationPage> {
  await requireAgentAdmin();
  const parsed = conversationsInputSchema.safeParse(input);
  if (!parsed.success) return { items: [], nextCursor: null };
  return queryInboxConversationsPage({
    q: parsed.data.q,
    channel: parsed.data.channel,
    account: normalizeAccountParam(parsed.data.account),
    cursor: parsed.data.cursor,
  });
}

export async function loadMessages(input: unknown): Promise<MessagePage> {
  await requireAgentAdmin();
  const parsed = messagesInputSchema.safeParse(input);
  if (!parsed.success) return { items: [], nextCursor: null };
  return queryMessagesPage(parsed.data);
}
