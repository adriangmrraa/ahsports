import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, gt, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { leads } from "@/db/schema";
import { authorizeAgentApi } from "@/lib/agent/rbac";
import { createEventStream, SSE_LOOKBACK_MS } from "@/lib/live/sse";
import { encodeStreamCursor, parseStreamCursor, type LeadCreatedEvent } from "@/lib/live/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events/leads — SSE stream of `leads` rows with
 * `created_at > cursor`, ascending. Leads are insert-mostly (status moves are
 * a later wave), so creation is the live signal the list page needs — each
 * event triggers a debounced `router.refresh()`. Admin/gerencia only
 * (`authorizeAgentApi`, same as /admin/leads).
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

  return createEventStream(request, "leads", async () => {
    const rows = await db
      .select({
        id: leads.id,
        status: leads.status,
        channel: leads.channel,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(or(gt(leads.createdAt, cursor.at), and(eq(leads.createdAt, cursor.at), gt(leads.id, cursor.id))))
      .orderBy(asc(leads.createdAt), asc(leads.id))
      .limit(200);

    const last = rows[rows.length - 1];
    if (last) cursor = { at: last.createdAt, id: last.id };

    return rows.map((row) => {
      const data: LeadCreatedEvent = {
        id: row.id,
        status: row.status,
        channel: row.channel,
        createdAt: row.createdAt.toISOString(),
      };
      return { id: encodeStreamCursor(row.createdAt, row.id), data };
    });
  });
}
