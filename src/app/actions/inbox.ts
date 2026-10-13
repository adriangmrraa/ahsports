"use server";

import { z } from "zod";
import { requireAgentAdmin } from "@/lib/agent/rbac";
import {
  queryConversationsPage,
  queryMessagesPage,
  type ConversationPage,
  type MessagePage,
} from "@/lib/agent/inbox";

/**
 * G3 — paginated reads for the agent inbox.
 *
 * Thin, authorization-gated wrappers around the cursor queries: the client
 * components call these to fetch the next page as the operator scrolls. Every
 * call re-checks `requireAgentAdmin()`; authorization is never weakened.
 */

const isoDateTime = z.string().datetime();

const conversationsInputSchema = z.object({
  q: z.string().trim().max(200).optional(),
  channel: z.enum(["telegram", "whatsapp"]).optional(),
  cursor: z
    .object({ lastMessageAt: isoDateTime.nullable(), id: z.string().min(1).max(64) })
    .nullable()
    .optional(),
});

const messagesInputSchema = z.object({
  conversationId: z.string().min(1).max(64),
  cursor: z.object({ createdAt: isoDateTime, id: z.string().min(1).max(64) }).nullable().optional(),
});

export async function loadConversations(input: unknown): Promise<ConversationPage> {
  await requireAgentAdmin();
  const parsed = conversationsInputSchema.safeParse(input);
  if (!parsed.success) return { items: [], nextCursor: null };
  return queryConversationsPage(parsed.data);
}

export async function loadMessages(input: unknown): Promise<MessagePage> {
  await requireAgentAdmin();
  const parsed = messagesInputSchema.safeParse(input);
  if (!parsed.success) return { items: [], nextCursor: null };
  return queryMessagesPage(parsed.data);
}
