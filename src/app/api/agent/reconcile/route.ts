import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAgentApi } from "@/lib/agent/rbac";
import { timingSafeEqualString } from "@/lib/channels/telegram";
import { runReconcile } from "@/lib/agents/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET/POST /api/agent/reconcile — cron maintenance endpoint (P5).
 *
 * A cron caller has no session, so the route is protected by a constant-time
 * shared-secret check against `CRON_SECRET` (falling back to
 * `AGENT_CRON_SECRET`), presented as `x-cron-secret` or `Authorization: Bearer`.
 * An authenticated admin/gerencia session is accepted as the alternative. The
 * route is never left open: an unauthenticated request is rejected before any
 * work. The run itself (`runReconcile`) is idempotent and safe to overlap.
 */

const querySchema = z.object({
  batchSize: z.coerce.number().int().min(1).max(500).optional(),
});

type AuthorizationResult = { ok: true } | { ok: false; status: 401 | 403 };

function expectedCronSecret(): string {
  return process.env.CRON_SECRET ?? process.env.AGENT_CRON_SECRET ?? "";
}

function presentedCronSecret(request: Request): string {
  const header = request.headers.get("x-cron-secret");
  if (header) return header;
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match ? match[1].trim() : "";
}

async function authorize(request: Request): Promise<AuthorizationResult> {
  const expected = expectedCronSecret();
  if (expected) {
    const presented = presentedCronSecret(request);
    if (presented && timingSafeEqualString(presented, expected)) return { ok: true };
  }

  const session = await authorizeAgentApi();
  if (session.ok) return { ok: true };
  return { ok: false, status: session.status };
}

async function handle(request: Request): Promise<NextResponse> {
  const authorization = await authorize(request);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: authorization.status });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  try {
    const summary = await runReconcile({ batchSize: parsed.data.batchSize });
    return NextResponse.json({ ok: true, summary });
  } catch {
    return NextResponse.json({ ok: false, error: "reconcile_failed" }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
