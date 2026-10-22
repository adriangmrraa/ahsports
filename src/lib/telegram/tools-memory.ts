import "server-only";

import { and, asc, eq, like } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { agentMemories } from "@/db/schema";
import type { AgentTool } from "@/lib/agents/tools/types";
import { withAuditLog } from "@/lib/telegram/confirmations";

/**
 * Operator memory + reconcile-candidate tools — port of SocialCRM
 * `toolsMemory.ts` onto `agent_memories` (no dedicated tables in this wave).
 *
 *  - operator notes: scope `global`, key `op-note:{slug}` — value carries the
 *    `active` flag (the table has no status column);
 *  - reconcile candidates: scope `global`, key `reconcile:candidate:{uuid}` —
 *    written by the unattended read-only reconciler; resolved here by humans.
 */

const idLike = z.string().trim().min(1).max(64);
const OP_NOTE_PREFIX = "op-note:";
const CANDIDATE_PREFIX = "reconcile:candidate:";

const slugSchema = z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9-_]*$/i, "slug inválido");

// ── Operator notes ──────────────────────────────────────────────────────────

const rememberInput = z.object({
  key: slugSchema,
  content: z.string().trim().min(1).max(4000),
});

export const rememberThisTool = withAuditLog({
  id: "rememberThis",
  description: "Guarda una nota/regla operativa durable (clave + contenido) visible para el equipo. Reversible, queda auditado.",
  effect: "draft",
  inputSchema: rememberInput,
  async handler(input, context) {
    const value = { content: input.content, active: true, updatedBy: context.actorRef ?? null, updatedAt: new Date().toISOString() };
    await db
      .insert(agentMemories)
      .values({ scope: "global", key: `${OP_NOTE_PREFIX}${input.key.toLowerCase()}`, value })
      .onConflictDoUpdate({ target: [agentMemories.scope, agentMemories.key], set: { value } });
    return { ok: true as const, key: input.key.toLowerCase() };
  },
} satisfies AgentTool<z.infer<typeof rememberInput>>);

const forgetInput = z.object({ key: slugSchema });

export const forgetThisTool = withAuditLog({
  id: "forgetThis",
  description: "Desactiva una nota operativa por clave (soft delete). Reversible, queda auditado.",
  effect: "draft",
  inputSchema: forgetInput,
  async handler(input, context) {
    const key = `${OP_NOTE_PREFIX}${input.key.toLowerCase()}`;
    const [row] = await db.select({ value: agentMemories.value }).from(agentMemories).where(and(eq(agentMemories.scope, "global"), eq(agentMemories.key, key))).limit(1);
    if (!row) return { ok: false as const, error: "not_found" as const };
    const value = { ...(row.value as Record<string, unknown>), active: false, updatedBy: context.actorRef ?? null, updatedAt: new Date().toISOString() };
    await db.update(agentMemories).set({ value }).where(and(eq(agentMemories.scope, "global"), eq(agentMemories.key, key)));
    return { ok: true as const, key: input.key.toLowerCase(), deactivated: true as const };
  },
} satisfies AgentTool<z.infer<typeof forgetInput>>);

const recallInput = z.object({ includeInactive: z.boolean().optional() });

export const recallMemoriesTool: AgentTool<z.infer<typeof recallInput>> = {
  id: "recallMemories",
  description: "Lista las notas operativas guardadas (activas salvo que se pida incluir inactivas). Solo lectura.",
  effect: "read",
  inputSchema: recallInput,
  async handler({ includeInactive }) {
    const rows = await db
      .select({ key: agentMemories.key, value: agentMemories.value })
      .from(agentMemories)
      .where(and(eq(agentMemories.scope, "global"), like(agentMemories.key, `${OP_NOTE_PREFIX}%`)))
      .orderBy(asc(agentMemories.key))
      .limit(100);
    const notes = rows.flatMap((row) => {
      const value = row.value as { content?: string; active?: boolean; updatedAt?: string };
      if (!includeInactive && value.active === false) return [];
      return [{ key: row.key.slice(OP_NOTE_PREFIX.length), content: value.content ?? "", active: value.active !== false, updatedAt: value.updatedAt ?? null }];
    });
    return { ok: true as const, count: notes.length, notes };
  },
};

// ── Reconcile candidates ────────────────────────────────────────────────────

const CANDIDATE_STATUSES = ["detected", "needs_info", "loaded", "dismissed"] as const;
export type ReconcileCandidateStatus = (typeof CANDIDATE_STATUSES)[number];

const getCandidatesInput = z.object({
  status: z.enum(CANDIDATE_STATUSES).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const getReconcileCandidatesTool: AgentTool<z.infer<typeof getCandidatesInput>> = {
  id: "getReconcileCandidates",
  description:
    "Lista candidatos de reconciliación (ventas/pedidos detectados en conversaciones que no están cargados). Filtrable por estado: detected, needs_info, loaded, dismissed. Solo lectura.",
  effect: "read",
  inputSchema: getCandidatesInput,
  async handler({ status, limit }) {
    const rows = await db
      .select({ key: agentMemories.key, value: agentMemories.value, createdAt: agentMemories.createdAt })
      .from(agentMemories)
      .where(and(eq(agentMemories.scope, "global"), like(agentMemories.key, `${CANDIDATE_PREFIX}%`)))
      .orderBy(asc(agentMemories.createdAt))
      .limit(200);
    const candidates = rows.flatMap((row) => {
      const value = row.value as {
        status?: ReconcileCandidateStatus;
        kind?: string;
        summary?: string;
        conversationId?: string;
        resolvedAt?: string;
      };
      const candidateStatus = value.status ?? "detected";
      if (status && candidateStatus !== status) return [];
      return [
        {
          candidateId: row.key.slice(CANDIDATE_PREFIX.length),
          status: candidateStatus,
          kind: value.kind ?? "sale",
          summary: value.summary ?? "",
          conversationId: value.conversationId ?? null,
          createdAt: row.createdAt.toISOString(),
          resolvedAt: value.resolvedAt ?? null,
        },
      ];
    });
    return { ok: true as const, count: candidates.length, candidates: candidates.slice(0, limit ?? 15) };
  },
};

const resolveCandidateInput = z.object({
  candidateId: z.string().trim().min(6).max(64),
  resolution: z.enum(["loaded", "dismissed", "needs_info"]),
  note: z.string().trim().max(500).optional(),
  orderId: idLike.optional(),
});

export const resolveReconcileCandidateTool = withAuditLog({
  id: "resolveReconcileCandidate",
  description:
    "Resuelve un candidato de reconciliación: 'loaded' (ya está cargado, opcional orderId), 'dismissed' (no era venta) o 'needs_info' (falta dato). Reversible, queda auditado.",
  effect: "draft",
  inputSchema: resolveCandidateInput,
  async handler(input, context) {
    const key = `${CANDIDATE_PREFIX}${input.candidateId}`;
    const [row] = await db.select({ value: agentMemories.value }).from(agentMemories).where(and(eq(agentMemories.scope, "global"), eq(agentMemories.key, key))).limit(1);
    if (!row) return { ok: false as const, error: "not_found" as const };
    const value = {
      ...(row.value as Record<string, unknown>),
      status: input.resolution,
      resolvedAt: new Date().toISOString(),
      resolvedBy: context.actorRef ?? null,
      resolutionNote: input.note ?? null,
      ...(input.orderId ? { orderId: input.orderId } : {}),
    };
    await db.update(agentMemories).set({ value }).where(and(eq(agentMemories.scope, "global"), eq(agentMemories.key, key)));
    return { ok: true as const, candidateId: input.candidateId, status: input.resolution };
  },
} satisfies AgentTool<z.infer<typeof resolveCandidateInput>>);

export const memoryTools = [rememberThisTool, forgetThisTool, recallMemoriesTool, getReconcileCandidatesTool, resolveReconcileCandidateTool] as const;
