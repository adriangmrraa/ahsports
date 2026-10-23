import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeAgentApi } from "@/lib/agent/rbac";
import { listDeadInboundJobs } from "@/lib/messaging/inbound-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dlq — B-05 (docs/12-SOCIALCRM-PARITY-AUDIT.md).
 *
 * Lists dead-lettered durable inbound jobs (jobs that exhausted
 * `INBOUND_JOB_MAX_ATTEMPTS` drain attempts) with their last error, attempt
 * count, and channel. Admin/gerencia session only — `authorizeAgentApi`
 * answers 401/403 rather than redirecting.
 */

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authorizeAgentApi();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: auth.status });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  try {
    const jobs = await listDeadInboundJobs(parsed.data.limit ?? 100);
    return NextResponse.json({
      ok: true,
      jobs: jobs.map((job) => ({
        id: job.id,
        dedupKey: job.dedupKey,
        channel: job.channel,
        channelAccountId: job.channelAccountId,
        accountProvider: job.accountProvider,
        accountSender: job.accountSender,
        accountDisplayName: job.accountDisplayName,
        conversationId: job.conversationId,
        conversationKey: job.conversationKey,
        attempts: job.attempts,
        lastError: job.lastError,
        runAfter: job.runAfter.toISOString(),
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[admin/dlq] listing failed:", error);
    return NextResponse.json({ ok: false, error: "dlq_list_failed" }, { status: 500 });
  }
}
