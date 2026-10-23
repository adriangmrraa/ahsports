import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, gt, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createEventStream, SSE_LOOKBACK_MS } from "@/lib/live/sse";
import { encodeStreamCursor, parseStreamCursor, type OrderChangedEvent } from "@/lib/live/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events/orders — SSE stream of `orders` rows with
 * `updated_at > cursor`, ascending. Every write path bumps `updated_at`
 * (stage transitions, quotes, notes, urgency), so a change in any status —
 * including rows entering or leaving the kanban-active set — is emitted and
 * the client decides placement. Any authenticated admin session may
 * subscribe (same boundary as the pedidos pages: `requireUser` via the
 * (admin) layout).
 */

const cursorSchema = z.string().min(3).max(200);

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rawCursor =
    request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("cursor");
  const parsedCursor = cursorSchema.safeParse(rawCursor);
  let cursor = (parsedCursor.success ? parseStreamCursor(parsedCursor.data) : null) ?? {
    at: new Date(Date.now() - SSE_LOOKBACK_MS),
    id: "",
  };

  return createEventStream(request, "orders", async () => {
    const rows = await db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        totalQuoted: orders.totalQuoted,
        notes: orders.notes,
        urgent: orders.urgent,
        updatedAt: orders.updatedAt,
      })
      .from(orders)
      .where(or(gt(orders.updatedAt, cursor.at), and(eq(orders.updatedAt, cursor.at), gt(orders.id, cursor.id))))
      .orderBy(asc(orders.updatedAt), asc(orders.id))
      .limit(200);

    const last = rows[rows.length - 1];
    if (last) cursor = { at: last.updatedAt, id: last.id };

    return rows.map((row) => {
      const data: OrderChangedEvent = {
        id: row.id,
        number: row.number,
        status: row.status,
        totalQuoted: row.totalQuoted,
        notes: row.notes,
        urgent: row.urgent,
        updatedAt: row.updatedAt.toISOString(),
      };
      return { id: encodeStreamCursor(row.updatedAt, row.id), data };
    });
  });
}
