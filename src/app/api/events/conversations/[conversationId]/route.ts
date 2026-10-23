import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { chatMessages, conversations } from "@/db/schema";
import { authorizeAgentApi } from "@/lib/agent/rbac";
import { queryMessagesAfter } from "@/lib/agent/inbox";
import { createEventStream } from "@/lib/live/sse";
import { encodeStreamCursor, parseStreamCursor } from "@/lib/live/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events/conversations/[conversationId] — SSE stream of new
 * `chat_messages` rows for one conversation.
 *
 * Cursor protocol: each frame carries `id: <createdAt>~<messageId>`; the
 * browser replays it as `Last-Event-ID` on reconnect, so resume is exact.
 * First connect may pass `?cursor=` (the client's newest rendered message) —
 * with neither, the baseline is the latest existing row and only future
 * inserts stream. Admin/gerencia session only (`authorizeAgentApi`).
 */

const paramsSchema = z.object({ conversationId: z.string().min(1).max(64) });
const cursorSchema = z.string().min(3).max(200);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const auth = await authorizeAgentApi();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: auth.status });
  }

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  const { conversationId } = parsed.data;

  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conversation) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const rawCursor =
    request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("cursor");
  const parsedCursor = cursorSchema.safeParse(rawCursor);
  const initial = parsedCursor.success ? parseStreamCursor(parsedCursor.data) : null;

  // Declared non-null so the closure below keeps the narrowed type.
  let cursor: { at: Date; id: string };
  if (initial) {
    cursor = initial;
  } else {
    const [latest] = await db
      .select({ id: chatMessages.id, createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
      .limit(1);
    cursor = latest ? { at: latest.createdAt, id: latest.id } : { at: new Date(0), id: "" };
  }

  return createEventStream(request, "conversations", async () => {
    const rows = await queryMessagesAfter({
      conversationId,
      after: { createdAt: cursor.at.toISOString(), id: cursor.id },
    });
    const last = rows[rows.length - 1];
    if (last) cursor = { at: new Date(last.createdAt), id: last.id };
    return rows.map((message) => ({
      id: encodeStreamCursor(message.createdAt, message.id),
      data: message,
    }));
  });
}
