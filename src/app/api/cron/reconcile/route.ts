import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron/auth";
import { runReconcileCandidates } from "@/lib/reconcile/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/reconcile — cron entry point for the candidates-only
 * reconcile pass (A-06).
 *
 *   POST /api/cron/reconcile              → scan (36h lookback, 8 conversations)
 *   POST /api/cron/reconcile?mode=sweep   → sweep (72h lookback, up to 20)
 *   &limit=N                              → max conversations per run (1..20)
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`; `?key=` only when
 * `CRON_ALLOW_QUERY_KEY=1`. The runner is idempotent and lock-guarded, so
 * overlapping invocations answer `already_running` without double work.
 *
 * Only aggregate counts are returned — never conversation ids or message
 * content — and failures are logged without request details.
 */

type ReconcileMode = "scan" | "sweep";

const MODE_DEFAULTS: Record<
  ReconcileMode,
  { limit: number; lookbackHours: number; minNewMessages: number }
> = {
  scan: { limit: 8, lookbackHours: 36, minNewMessages: 4 },
  sweep: { limit: 20, lookbackHours: 72, minNewMessages: 1 },
};

function resolveLimit(raw: string | null, fallback: number): number {
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), 20);
}

export async function POST(request: Request): Promise<NextResponse> {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const mode: ReconcileMode =
    searchParams.get("mode") === "sweep" ? "sweep" : "scan";
  const defaults = MODE_DEFAULTS[mode];
  const limit = resolveLimit(searchParams.get("limit"), defaults.limit);

  try {
    const summary = await runReconcileCandidates({
      limit,
      lookbackHours: defaults.lookbackHours,
      minNewMessages: defaults.minNewMessages,
    });
    return NextResponse.json({
      ok: true,
      mode,
      status: summary.status,
      scanned: summary.scanned,
      candidatesCreated: summary.candidatesCreated,
      errors: summary.errors,
      ranAt: summary.ranAt,
      correlationId: summary.correlationId,
    });
  } catch {
    // Never log request details (query/IP) or reconciliation content here.
    console.error("[cron/reconcile] run failed");
    return NextResponse.json(
      { ok: false, error: "reconcile_failed" },
      { status: 500 },
    );
  }
}
