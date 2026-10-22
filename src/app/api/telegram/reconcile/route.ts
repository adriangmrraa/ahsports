import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAgentApi } from "@/lib/agent/rbac";
import { timingSafeEqualString } from "@/lib/channels/telegram";
import { runReconcileCandidates } from "@/lib/reconcile/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET/POST /api/telegram/reconcile — cron endpoint for the candidates-only
 * reconcile pass (wave 2).
 *
 * Auth mirrors /api/agent/reconcile: constant-time `x-cron-secret` /
 * `Authorization: Bearer` against CRON_SECRET (fallback AGENT_CRON_SECRET), or
 * an authenticated admin/gerencia session. Never left open. The run itself is
 * idempotent and lock-guarded; overlapping calls answer `already_running`.
 */

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  lookbackHours: z.coerce.number().int().min(1).max(720).optional(),
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
    const summary = await runReconcileCandidates({ limit: parsed.data.limit, lookbackHours: parsed.data.lookbackHours });
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
