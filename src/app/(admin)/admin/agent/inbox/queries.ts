import "server-only";

import { and, asc, desc, eq, ilike, isNull, lt, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import { channelAccounts, contacts, conversations, organizations } from "@/db/schema";
import { INBOX_PAGE_SIZE, queryConversationsPage, type ConversationCursor } from "@/lib/agent/inbox";
import { isSchemaNotReady } from "@/lib/channels/errors";
import {
  normalizeChannelParam,
  type InboxAccountFilter,
  type InboxAccountOption,
  type InboxConversationItem,
  type InboxConversationPage,
} from "./filters";

/**
 * Account-aware inbox queries for /admin/agent/inbox.
 *
 * `queryInboxConversationsPage` extends the wave-1 list query with a
 * `channel_accounts` join (account label/provider per row) and the
 * `?account=all|unassigned|<uuid>` predicate. On an un-migrated install the
 * accounts join/columns don't exist — the query falls back to the legacy
 * projection with null account fields so the inbox keeps working.
 */

export async function listInboxAccountOptions(): Promise<InboxAccountOption[]> {
  try {
    return await db
      .select({
        id: channelAccounts.id,
        channel: channelAccounts.channel,
        provider: channelAccounts.provider,
        senderAddress: channelAccounts.senderAddress,
        displayName: channelAccounts.displayName,
        status: channelAccounts.status,
      })
      .from(channelAccounts)
      .orderBy(asc(channelAccounts.channel), asc(channelAccounts.senderAddress));
  } catch (error) {
    if (isSchemaNotReady(error)) return [];
    throw error;
  }
}

export async function queryInboxConversationsPage(input: {
  q?: string;
  channel?: string;
  account?: InboxAccountFilter;
  cursor?: ConversationCursor | null;
}): Promise<InboxConversationPage> {
  const q = input.q?.trim();
  const channel = normalizeChannelParam(input.channel);
  const account = input.account ?? { kind: "all" as const };
  const cursor = input.cursor ?? null;

  const filters: SQL[] = [];
  if (channel) filters.push(eq(conversations.channel, channel));
  if (account.kind === "unassigned") {
    filters.push(isNull(conversations.channelAccountId));
  } else if (account.kind === "id") {
    filters.push(eq(conversations.channelAccountId, account.id));
  }
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

  try {
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
        channelAccountId: conversations.channelAccountId,
        accountSender: channelAccounts.senderAddress,
        accountDisplayName: channelAccounts.displayName,
        accountProvider: channelAccounts.provider,
      })
      .from(conversations)
      .leftJoin(contacts, eq(conversations.customerId, contacts.id))
      .leftJoin(organizations, eq(conversations.organizationId, organizations.id))
      .leftJoin(channelAccounts, eq(conversations.channelAccountId, channelAccounts.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(sql`${conversations.lastMessageAt} desc nulls last`, desc(conversations.id))
      .limit(INBOX_PAGE_SIZE + 1);

    const hasMore = rows.length > INBOX_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, INBOX_PAGE_SIZE) : rows;
    const last = page[page.length - 1];

    const items: InboxConversationItem[] = page.map((row) => ({
      id: row.id,
      channel: row.channel,
      externalThreadId: row.externalThreadId,
      status: row.status,
      lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
      unreadCount: row.unreadCount,
      customerName: row.customerName,
      orgName: row.orgName,
      channelAccountId: row.channelAccountId,
      accountLabel: row.accountDisplayName ?? row.accountSender,
      accountProvider: row.accountProvider,
    }));

    return {
      items,
      nextCursor:
        hasMore && last
          ? { lastMessageAt: last.lastMessageAt ? last.lastMessageAt.toISOString() : null, id: last.id }
          : null,
    };
  } catch (error) {
    if (!isSchemaNotReady(error)) throw error;
    // Un-migrated install: the account columns don't exist. "unassigned" and
    // "all" are equivalent then (nothing can be bound); a specific-account
    // filter can match nothing.
    if (account.kind === "id") return { items: [], nextCursor: null };
    const legacy = await queryConversationsPage({ q, channel, cursor });
    return {
      items: legacy.items.map((row) => ({
        ...row,
        channelAccountId: null,
        accountLabel: null,
        accountProvider: null,
      })),
      nextCursor: legacy.nextCursor,
    };
  }
}
