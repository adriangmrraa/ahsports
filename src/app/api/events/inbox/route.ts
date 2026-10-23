import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { conversations } from "@/db/schema";
import { authorizeAgentApi } from "@/lib/agent/rbac";
import { createEventStream, SSE_LOOKBACK_MS } from "@/lib/live/sse";
import { encodeStreamCursor, parseStreamCursor, type InboxActivityEvent } from "@/lib/live/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events/inbox — SSE stream of inbox activity.
 *
 * Emits one event per conversation whose activity timestamp
 * (`coalesce(last_message_at, created_at)`) passes the stream cursor —
 * new threads, new inbound/outbound bumps, unread/status changes. Payload is
 * deliberately thin: subscribers either merge it or treat it as a "refetch
 * the head" signal. Admin/gerencia session only.
 */

const cursorSchema = z.string().min(3).max(200);

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await authorizeAgentApi();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: auth.status });
  }

  const rawCursor =
    request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("cursor");
  const parsedCursor = cursorSchema.safeParse(rawCursor);
  let cursor = (parsedCursor.success ? parseStreamCursor(parsedCursor.data) : null) ?? {
    at: new Date(Date.now() - SSE_LOOKBACK_MS),
    id: "",
  };

  const activity = sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`;

  return createEventStream(request, "inbox", async () => {
    const rows = await db
      .select({
        id: conversations.id,
        status: conversations.status,
        unreadCount: conversations.unreadCount,
        lastMessageAt: conversations.lastMessageAt,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(or(gt(activity, cursor.at), and(eq(activity, cursor.at), gt(conversations.id, cursor.id))))
      .orderBy(asc(activity), asc(conversations.id))
      .limit(200);

    const last = rows[rows.length - 1];
    if (last) cursor = { at: last.lastMessageAt ?? last.createdAt, id: last.id };

    return rows.map((row) => {
      const activityAt = row.lastMessageAt ?? row.createdAt;
      const data: InboxActivityEvent = {
        id: row.id,
        status: row.status,
        unreadCount: row.unreadCount,
        lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
      };
      return { id: encodeStreamCursor(activityAt, row.id), data };
    });
  });
}
