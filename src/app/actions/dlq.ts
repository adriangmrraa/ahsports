"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAgentAdmin } from "@/lib/agent/rbac";
import { drainPendingInboundTurns } from "@/lib/messaging/inbound-pipeline";
import { requeueDeadInboundJob } from "@/lib/messaging/inbound-queue";

/**
 * DLQ administration (C-06, docs/12-SOCIALCRM-PARITY-AUDIT.md).
 *
 * `retryDlqJob` re-queues a dead-lettered inbound job: status back to
 * `queued`, attempts reset, `runAfter` = now. The row is picked up by the next
 * drain pass — which we also kick immediately (best-effort, fire-and-forget)
 * so a manual retry dispatches in seconds on the long-lived Node runtime
 * instead of waiting for the next webhook or periodic sweep.
 *
 * Admin/gerencia only (`requireAgentAdmin`), Zod-validated input.
 */

const retryDlqJobSchema = z
  .object({
    id: z.string().trim().min(1).max(36),
  })
  .strict();

export async function retryDlqJob(input: unknown) {
  await requireAgentAdmin();
  const raw =
    input instanceof FormData ? Object.fromEntries(input) : input;
  const parsed = retryDlqJobSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }

  const requeued = await requeueDeadInboundJob(parsed.data.id);
  if (!requeued) {
    return {
      ok: false as const,
      error: "El trabajo no existe o ya fue reencolado.",
    };
  }

  // Best-effort immediate drain — the periodic sweep / next webhook would pick
  // the job up anyway, so a dropped kick is harmless.
  void drainPendingInboundTurns().catch(() => {});

  revalidatePath("/admin/agent/dlq");
  return { ok: true as const };
}
