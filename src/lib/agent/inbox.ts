import "server-only";

import { and, asc, desc, eq, gt, ilike, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { chatMessages, contacts, conversations, organizations } from "@/db/schema";

/**
 * Data access for the agent inbox (P4.2 / P4, G3).
 *
 * The canonical list and the conversation timeline are read-only projections of
 * `conversations` / `chat_messages`. Both are cursor-paginated so the UI never
 * loads the whole history up front: latest first, load older on demand.
 *
 * Authorization lives in the callers (page components + server actions via
 * `requireAgentAdmin`); these functions are pure queries.
 */

export const INBOX_PAGE_SIZE = 50;

export type ConversationListItem = {
  id: string;
  channel: string;
  externalThreadId: string;
  status: string;
  lastMessageAt: string | null;
  unreadCount: number;
  customerName: string | null;
  orgName: string | null;
};

/**
 * Keyset cursor for `conversations` ordered by `last_message_at DESC NULLS LAST,
 * id DESC`. `lastMessageAt` is nullable, so the cursor carries it explicitly.
 */
export type ConversationCursor = {
  lastMessageAt: string | null;
  id: string;
};

export type ConversationPage = {
  items: ConversationListItem[];
  nextCursor: ConversationCursor | null;
};

export type ChatMessageItem = {
  id: string;
  direction: string;
  senderKind: string;
  senderRef: string | null;
  channel: string;
  contentType: string;
  content: string;
  deliveryState: string;
  platformMessageId: string;
  createdAt: string;
};

/** Keyset cursor for `chat_messages` ordered by `created_at DESC, id DESC`. */
export type MessageCursor = {
  createdAt: string;
  id: string;
};

export type MessagePage = {
  items: ChatMessageItem[];
  nextCursor: MessageCursor | null;
};

const chatMessageProjection = {
  id: chatMessages.id,
  direction: chatMessages.direction,
  senderKind: chatMessages.senderKind,
  senderRef: chatMessages.senderRef,
  channel: chatMessages.channel,
  contentType: chatMessages.contentType,
  content: chatMessages.content,
  deliveryState: chatMessages.deliveryState,
  platformMessageId: chatMessages.platformMessageId,
  createdAt: chatMessages.createdAt,
} as const;

type ChatMessageRow = Pick<
  typeof chatMessages.$inferSelect,
  keyof typeof chatMessageProjection
>;

function toChatMessageItem(row: ChatMessageRow): ChatMessageItem {
  return {
    id: row.id,
    direction: row.direction,
    senderKind: row.senderKind,
    senderRef: row.senderRef,
    channel: row.channel,
    contentType: row.contentType,
    content: row.content,
    deliveryState: row.deliveryState,
    platformMessageId: row.platformMessageId,
    createdAt: row.createdAt.toISOString(),
  };
}

function normalizeChannel(channel: string | undefined): "telegram" | "whatsapp" | undefined {
  return channel === "telegram" || channel === "whatsapp" ? channel : undefined;
}

/**
 * One page of conversations, latest activity first. `q` matches thread id,
 * customer name, organization name or channel; `channel` filters the channel.
 * Both run in SQL — never in JS.
 */
export async function queryConversationsPage(input: {
  q?: string;
  channel?: string;
  cursor?: ConversationCursor | null;
}): Promise<ConversationPage> {
  const q = input.q?.trim();
  const channel = normalizeChannel(input.channel);
  const cursor = input.cursor ?? null;

  const filters: SQL[] = [];
  if (channel) filters.push(eq(conversations.channel, channel));
  if (q) {
    const like = `%${q}%`;
    const search = or(
      ilike(conversations.externalThreadId, like),
      ilike(contacts.name, like),
      ilike(organizations.name, like),
      sql`${conversations.channel}::text ilike ${like}`,
    );
    if (search) filters.push(search);
  }
  if (cursor) {
    if (cursor.lastMessageAt) {
      const at = new Date(cursor.lastMessageAt);
      const before = or(
        isNull(conversations.lastMessageAt),
        lt(conversations.lastMessageAt, at),
        and(eq(conversations.lastMessageAt, at), lt(conversations.id, cursor.id)),
      );
      if (before) filters.push(before);
    } else {
      const remainingNulls = and(isNull(conversations.lastMessageAt), lt(conversations.id, cursor.id));
      if (remainingNulls) filters.push(remainingNulls);
    }
  }

  const rows = await db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      externalThreadId: conversations.externalThreadId,
      status: conversations.status,
      lastMessageAt: conversations.lastMessageAt,
      unreadCount: conversations.unreadCount,
      customerName: contacts.name,
      orgName: organizations.name,
    })
    .from(conversations)
    .leftJoin(contacts, eq(conversations.customerId, contacts.id))
    .leftJoin(organizations, eq(conversations.organizationId, organizations.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(sql`${conversations.lastMessageAt} desc nulls last`, desc(conversations.id))
    .limit(INBOX_PAGE_SIZE + 1);

  const hasMore = rows.length > INBOX_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, INBOX_PAGE_SIZE) : rows;
  const last = page[page.length - 1];

  const items: ConversationListItem[] = page.map((row) => ({
    id: row.id,
    channel: row.channel,
    externalThreadId: row.externalThreadId,
    status: row.status,
    lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
    unreadCount: row.unreadCount,
    customerName: row.customerName,
    orgName: row.orgName,
  }));

  return {
    items,
    nextCursor:
      hasMore && last
        ? { lastMessageAt: last.lastMessageAt ? last.lastMessageAt.toISOString() : null, id: last.id }
        : null,
  };
}

/**
 * One page of messages for a conversation, newest first. Passing the previous
 * page's `nextCursor` fetches the messages immediately older than it.
 */
export async function queryMessagesPage(input: {
  conversationId: string;
  cursor?: MessageCursor | null;
}): Promise<MessagePage> {
  const cursor = input.cursor ?? null;
  const filters: SQL[] = [eq(chatMessages.conversationId, input.conversationId)];

  if (cursor) {
    const at = new Date(cursor.createdAt);
    const before = or(
      lt(chatMessages.createdAt, at),
      and(eq(chatMessages.createdAt, at), lt(chatMessages.id, cursor.id)),
    );
    if (before) filters.push(before);
  }

  const rows = await db
    .select(chatMessageProjection)
    .from(chatMessages)
    .where(and(...filters))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(INBOX_PAGE_SIZE + 1);

  const hasMore = rows.length > INBOX_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, INBOX_PAGE_SIZE) : rows;
  const last = page[page.length - 1];

  return {
    items: page.map(toChatMessageItem),
    nextCursor: hasMore && last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null,
  };
}

/** Max rows emitted per live poll — far above any real burst. */
export const MESSAGES_AFTER_BATCH = 200;

/**
 * Forward-cursor companion of `queryMessagesPage`: rows strictly newer than
 * `after` (same `(created_at, id)` keyset), ascending — the order subscribers
 * append them in. Backs the /api/events/conversations/[id] SSE stream.
 */
export async function queryMessagesAfter(input: {
  conversationId: string;
  after: MessageCursor;
  limit?: number;
}): Promise<ChatMessageItem[]> {
  const at = new Date(input.after.createdAt);
  const rows = await db
    .select(chatMessageProjection)
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.conversationId, input.conversationId),
        or(
          gt(chatMessages.createdAt, at),
          and(eq(chatMessages.createdAt, at), gt(chatMessages.id, input.after.id)),
        ),
      ),
    )
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
    .limit(input.limit ?? MESSAGES_AFTER_BATCH);

  return rows.map(toChatMessageItem);
}
