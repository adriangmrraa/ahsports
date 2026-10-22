import "server-only";

import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, like, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { agentMemories } from "@/db/schema";
import { OPERATOR_BINDING_SCOPE } from "@/lib/agent/identity";
import type { AgentTool, AgentToolContext } from "@/lib/agents/tools/types";
import { auditOperatorAction } from "@/lib/telegram/audit";
import { notifyOperators } from "@/lib/telegram/notifier";

/**
 * Two-step operator confirmation gate (port of SocialCRM
 * `tool-confirmations.ts`, hardened for serverless).
 *
 * A high-impact tool call never executes: it persists a PENDING ACTION in
 * `agent_memories` (scope `operator`, key `pending-confirm:{token}`) with a
 * short TTL, notifies the operator chats out-of-band and replies with a
 * `CONFIRM <token>` instruction. The ONLY path that executes the action is
 * `executePendingAction(token)` — a server-side, single-use, atomic claim:
 *
 *   - a model echoing the token or re-calling the tool cannot confirm;
 *   - the token is consumed (row deleted) before the handler runs, so a
 *     double-confirm or a parallel claim fails closed;
 *   - the executor map holds the INNER tool: only tools explicitly registered
 *     as confirmable can ever run through a token;
 *   - args are re-validated through the tool's Zod schema at execution time.
 *
 * Persistence beats SocialCRM's in-memory Map: pending actions survive
 * restarts and work across serverless instances while keeping the same
 * single-use semantics via a DELETE ... RETURNING claim.
 */

export const PENDING_CONFIRMATION_TTL_MS = 1000 * 60 * 10;
const MAX_PENDING_ACTIONS = 50;
const PENDING_KEY_PREFIX = "pending-confirm:";

const pendingValueSchema = z.object({
  toolId: z.string().min(1).max(64),
  args: z.unknown(),
  actorRef: z.string().max(64).nullish(),
  description: z.string().max(2000).optional(),
  requestedAt: z.string(),
});

export type PendingAction = z.infer<typeof pendingValueSchema>;

/** Inner tools executable via a held token, keyed by tool id. */
const CONFIRMABLE_TOOLS = new Map<string, AgentTool>();

/** Registers the inner (ungated) tool as the executor for its own tokens. */
export function registerConfirmable(tool: AgentTool): void {
  CONFIRMABLE_TOOLS.set(tool.id, tool);
}

function pendingKey(token: string): string {
  return `${PENDING_KEY_PREFIX}${token}`;
}

async function prunePendingActions(): Promise<void> {
  const rows = await db
    .select({ id: agentMemories.id })
    .from(agentMemories)
    .where(and(eq(agentMemories.scope, OPERATOR_BINDING_SCOPE), like(agentMemories.key, `${PENDING_KEY_PREFIX}%`)))
    .orderBy(asc(agentMemories.createdAt))
    .limit(MAX_PENDING_ACTIONS + 10);
  const overflow = rows.length - (MAX_PENDING_ACTIONS - 1);
  if (overflow <= 0) return;
  await db.delete(agentMemories).where(
    inArray(
      agentMemories.id,
      rows.slice(0, overflow).map((row) => row.id),
    ),
  );
}

export type ConfirmationRequest = {
  tool: AgentTool;
  args: unknown;
  context: AgentToolContext;
  /** es-AR summary shown to operators, e.g. "cancelar pedido #42". */
  description: string;
};

export type PendingConfirmationResult = {
  pending: true;
  tool: string;
  token: string;
  notifiedOperators: number;
  message: string;
};

/**
 * Persists a pending action and notifies the operator chats. Returns the
 * object the tool hands back to the model — it carries the token so the
 * assistant can quote it, but the token alone proves nothing until a human
 * sends `CONFIRM <token>` through the channel.
 */
export async function requestOperatorConfirmation(input: ConfirmationRequest): Promise<PendingConfirmationResult> {
  const now = new Date();
  await prunePendingActions();

  const expiresAt = new Date(now.getTime() + PENDING_CONFIRMATION_TTL_MS);
  const value: PendingAction = {
    toolId: input.tool.id,
    args: input.args,
    actorRef: input.context.actorRef ?? null,
    description: input.description,
    requestedAt: now.toISOString(),
  };

  let token = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    token = randomBytes(5).toString("hex");
    const [created] = await db
      .insert(agentMemories)
      .values({ scope: OPERATOR_BINDING_SCOPE, key: pendingKey(token), value, expiresAt })
      .onConflictDoNothing()
      .returning({ key: agentMemories.key });
    if (created) break;
  }
  if (!token) throw new Error("pending_confirmation_unavailable");

  await auditOperatorAction({ toolId: input.tool.id, phase: "requested", args: input.args, context: input.context });

  const notified = await notifyOperators(
    [
      "⚠️ Acción pendiente de confirmación",
      input.description,
      "",
      `Confirmá con: CONFIRM ${token}`,
      `Expira en ${Math.round(PENDING_CONFIRMATION_TTL_MS / 60000)} minutos.`,
    ].join("\n"),
  );

  return {
    pending: true,
    tool: input.tool.id,
    token,
    notifiedOperators: notified.delivered,
    message: [
      `Acción pendiente: ${input.description}`,
      `El operador debe confirmar escribiendo: CONFIRM ${token}`,
      "Nada se ejecutó todavía. No reintentar ni repetir la herramienta.",
    ].join("\n"),
  };
}

export type PendingActionExecution =
  | { ok: true; result: unknown }
  | { ok: false; error: "invalid_token" | "unknown_tool" | "invalid_args" | "handler_failed"; message: string };

/**
 * Claims and executes a pending action by token. The DELETE...RETURNING claim
 * is atomic: the first caller wins, every later confirm finds nothing.
 */
export async function executePendingAction(rawToken: string): Promise<PendingActionExecution> {
  const token = rawToken.trim().toLowerCase();
  if (!/^[0-9a-f]{10}$/.test(token)) {
    return { ok: false, error: "invalid_token", message: "Token inválido o expirado. Pedí que la acción se vuelva a solicitar." };
  }

  const now = new Date();
  const claimed = await db
    .delete(agentMemories)
    .where(
      and(
        eq(agentMemories.scope, OPERATOR_BINDING_SCOPE),
        eq(agentMemories.key, pendingKey(token)),
        or(isNull(agentMemories.expiresAt), gt(agentMemories.expiresAt, now)),
      ),
    )
    .returning({ value: agentMemories.value });

  const parsed = pendingValueSchema.safeParse(claimed[0]?.value);
  if (!parsed.success) {
    return { ok: false, error: "invalid_token", message: "Token inválido o expirado. Pedí que la acción se vuelva a solicitar." };
  }
  const pending = parsed.data;
  const context: AgentToolContext = { actorRef: pending.actorRef ?? null };

  const tool = CONFIRMABLE_TOOLS.get(pending.toolId);
  if (!tool) {
    return { ok: false, error: "unknown_tool", message: `La acción ${pending.toolId} ya no está disponible.` };
  }

  const args = tool.inputSchema.safeParse(pending.args);
  if (!args.success) {
    await auditOperatorAction({ toolId: pending.toolId, phase: "denied", args: pending.args, context, error: "invalid_args" });
    return { ok: false, error: "invalid_args", message: "La acción guardada quedó con argumentos inválidos; volvé a pedirla." };
  }

  try {
    const result = await tool.handler(args.data, context);
    await auditOperatorAction({ toolId: pending.toolId, phase: "executed", args: args.data, context, result });
    return { ok: true, result };
  } catch {
    await auditOperatorAction({ toolId: pending.toolId, phase: "failed", args: args.data, context, error: "handler_failed" });
    return { ok: false, error: "handler_failed", message: "La acción confirmada falló al ejecutarse. Nada quedó a medias que no sea reversible; revisá el estado del pedido." };
  }
}

/** es-AR summary builders, keyed by tool id, for the operator notice. */
type Describer = (args: Record<string, unknown>) => string;
const describers = new Map<string, Describer>();

export function registerActionDescriber(toolId: string, describe: Describer): void {
  describers.set(toolId, describe);
}

/**
 * Wraps a high-impact tool: the registered tool NEVER mutates — it queues a
 * pending action and returns the CONFIRM instruction. The inner tool is
 * registered in `CONFIRMABLE_TOOLS` as the only executor for its tokens.
 */
export function withOperatorConfirmation(tool: AgentTool, describe?: Describer): AgentTool {
  registerConfirmable(tool);
  if (describe) registerActionDescriber(tool.id, describe);
  return {
    ...tool,
    description: `${tool.description} REQUIERE confirmación humana en dos pasos: la llamada solo crea la acción pendiente.`,
    async handler(input, context) {
      const describer = describers.get(tool.id);
      const description = describer ? describer(input as Record<string, unknown>) : `Ejecutar ${tool.id}`;
      return requestOperatorConfirmation({ tool, args: input, context, description });
    },
  };
}

/** Wraps a low-impact mutation: executes immediately + audits the fact. */
export function withAuditLog(tool: AgentTool): AgentTool {
  return {
    ...tool,
    async handler(input, context) {
      try {
        const result = await tool.handler(input, context);
        await auditOperatorAction({ toolId: tool.id, phase: "executed", args: input, context, result });
        return result;
      } catch (error) {
        await auditOperatorAction({ toolId: tool.id, phase: "failed", args: input, context, error: "handler_failed" });
        throw error;
      }
    },
  };
}

// ── confirmAction / cancelPendingAction tools ───────────────────────────────

const confirmActionInput = z.object({
  token: z.string().trim().min(6).max(32),
});

/**
 * Releases a pending action. `effect: 'draft'`: from the loop's perspective
 * this tool only ever *releases* a human-held token — the pending action row
 * is the only state it touches before the inner (pre-authorized) handler runs.
 */
export const confirmActionTool: AgentTool<z.infer<typeof confirmActionInput>> = {
  id: "confirmAction",
  description:
    "Ejecuta una acción pendiente a partir del token entregado fuera de banda (CONFIRM <token>). Solo funciona con un token real emitido por el sistema; inventar o repetir tokens no confirma nada.",
  effect: "draft",
  inputSchema: confirmActionInput,
  async handler({ token }) {
    const executed = await executePendingAction(token);
    if (!executed.ok) return { ok: false as const, error: executed.error, message: executed.message };
    return { ok: true as const, confirmed: true as const, result: executed.result };
  },
};

const cancelPendingInput = z.object({
  token: z.string().trim().min(6).max(32),
});

export const cancelPendingActionTool: AgentTool<z.infer<typeof cancelPendingInput>> = {
  id: "cancelPendingAction",
  description: "Cancela una acción pendiente por token antes de que expire o se confirme. Solo afecta acciones pendientes.",
  effect: "draft",
  inputSchema: cancelPendingInput,
  async handler({ token }, context) {
    const removed = await db
      .delete(agentMemories)
      .where(and(eq(agentMemories.scope, OPERATOR_BINDING_SCOPE), eq(agentMemories.key, pendingKey(token.trim().toLowerCase()))))
      .returning({ key: agentMemories.key });
    if (removed.length > 0) {
      await auditOperatorAction({ toolId: "cancelPendingAction", phase: "executed", args: { token }, context });
      return { ok: true as const, cancelled: true as const };
    }
    return { ok: false as const, error: "not_found" as const, message: "No hay acción pendiente con ese token (o ya se ejecutó/expiró)." };
  },
};

const listPendingInput = z.object({});

export const listPendingActionsTool: AgentTool<z.infer<typeof listPendingInput>> = {
  id: "listPendingActions",
  description: "Lista las acciones pendientes de confirmación (no vencidas) con su token y descripción. Solo lectura.",
  effect: "read",
  inputSchema: listPendingInput,
  async handler() {
    const now = new Date();
    const rows = await db
      .select({ key: agentMemories.key, value: agentMemories.value, expiresAt: agentMemories.expiresAt })
      .from(agentMemories)
      .where(
        and(
          eq(agentMemories.scope, OPERATOR_BINDING_SCOPE),
          like(agentMemories.key, `${PENDING_KEY_PREFIX}%`),
          or(isNull(agentMemories.expiresAt), gt(agentMemories.expiresAt, now)),
        ),
      )
      .orderBy(asc(agentMemories.createdAt))
      .limit(20);
    const actions = rows.flatMap((row) => {
      const parsed = pendingValueSchema.safeParse(row.value);
      if (!parsed.success) return [];
      return [
        {
          token: row.key.slice(PENDING_KEY_PREFIX.length),
          tool: parsed.data.toolId,
          description: parsed.data.description ?? "",
          requestedAt: parsed.data.requestedAt,
          expiresAt: row.expiresAt?.toISOString() ?? null,
        },
      ];
    });
    return { ok: true as const, count: actions.length, actions };
  },
};

