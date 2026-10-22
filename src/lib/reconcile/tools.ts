import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { agentMemories } from "@/db/schema";
import type { AgentTool } from "@/lib/agents/tools/types";
import { lookupCustomerTool, lookupOrderTool } from "@/lib/agents/tools/read";
import { getOrderDetailTool, searchOrdersTool } from "@/lib/telegram/tools-orders";
import { searchContactsTool, searchOrganizationsTool } from "@/lib/telegram/tools-clients";
import { searchProductsTool } from "@/lib/telegram/tools-products";

/**
 * Read-only reconcile toolset — port of SocialCRM `reconcile/tools.ts`.
 *
 * The unattended model gets ONLY readers (anti-dup lookups + catalog) plus
 * `reportReconcileCandidate` — the single write path, which lands a durable
 * candidate row in `agent_memories` for human review. Every detected fact is
 * a candidate; nothing authoritative is ever created here.
 */

export const CANDIDATE_KEY_PREFIX = "reconcile:candidate:";

const reportCandidateInput = z.object({
  kind: z.enum(["sale", "payment", "customer", "mapping", "other"]),
  summary: z.string().trim().min(4).max(1000),
  details: z.string().trim().max(4000).optional(),
});

export function buildReportCandidateTool(reportedIds: string[]): AgentTool<z.infer<typeof reportCandidateInput>> {
  return {
    id: "reportReconcileCandidate",
    description:
      "Reporta UN hecho comercial detectado en el transcript como candidato durable para revisión humana. Única escritura permitida: jamás crea pedidos, pagos, contactos ni productos.",
    effect: "draft",
    inputSchema: reportCandidateInput,
    async handler(input, context) {
      const candidateId = randomUUID();
      const value = {
        kind: input.kind,
        summary: input.summary,
        details: input.details ?? null,
        conversationId: context.conversationId ?? null,
        status: "detected" as const,
        createdAt: new Date().toISOString(),
      };
      await db
        .insert(agentMemories)
        .values({ scope: "global", key: `${CANDIDATE_KEY_PREFIX}${candidateId}`, value })
        .onConflictDoNothing();
      reportedIds.push(candidateId);
      return { ok: true as const, candidateId, note: "Candidato registrado para revisión humana." };
    },
  };
}

/**
 * Per-conversation toolset: readers shared with the operator bot (already
 * `effect: 'read'`) plus the candidate reporter bound to this run's id list.
 */
export function buildReconcileTools(reportedIds: string[]): AgentTool[] {
  return [
    searchOrdersTool,
    lookupOrderTool,
    getOrderDetailTool,
    lookupCustomerTool,
    searchContactsTool,
    searchOrganizationsTool,
    searchProductsTool,
    buildReportCandidateTool(reportedIds),
  ];
}

/** Loads a candidate record back (runner reporting). */
export async function loadCandidate(candidateId: string) {
  const [row] = await db
    .select({ value: agentMemories.value })
    .from(agentMemories)
    .where(and(eq(agentMemories.scope, "global"), eq(agentMemories.key, `${CANDIDATE_KEY_PREFIX}${candidateId}`)))
    .limit(1);
  return row?.value ?? null;
}
