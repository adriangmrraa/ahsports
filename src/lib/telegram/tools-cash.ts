import "server-only";

import { and, desc, eq, gte, lte, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { agentMemories, auditEvents, orders, payments } from "@/db/schema";
import { sumActivePaymentsCents, toCents } from "@/lib/payments";
import {
  addMovement,
  closeSession,
  ensureOpenSession,
  getOpenSession,
  getSnapshot,
  openSession,
} from "@/lib/cash/session";
import type { AgentTool } from "@/lib/agents/tools/types";
import { withOperatorConfirmation } from "@/lib/telegram/confirmations";
import { arDayRange, formatDateTimeAr } from "@/lib/telegram/format";
import { auditOperatorAction } from "@/lib/telegram/audit";

/**
 * Operator caja tools — textile mapping of SocialCRM `toolsCash.ts`.
 *
 * TWO layers coexist here:
 *
 *  1. Ledger caja (getCajaStatus / closeCaja / getCajaHistory): a reporting
 *     checkpoint over the payments ledger — durable close marker in
 *     `agent_memories` (key `caja:last_close`). Covers ALL payment methods.
 *
 *  2. Physical drawer (getCashSessionStatus / openCashSession /
 *     addCashMovement / closeCashSession): A-13 port of SocialCRM
 *     cash_sessions — `efectivo` payments land in a chained session that
 *     opens where the previous closed and closes with a physical count
 *     (expected vs actual). Closed sessions are immutable audit seats.
 *     Relevant because AH Sports collects cash when customers pick up
 *     finished orders. No automatic rollover: the factory does not operate
 *     past midnight, so the 02:00 boundary logic of the food domain was
 *     deliberately not ported — the next openSession carries the chain.
 */

const idLike = z.string().trim().min(1).max(64);
const CAJA_CLOSE_KEY = "caja:last_close";

type CajaCloseMarker = { closedAt: string; totals: { payments: number; totalCents: number }; closedBy?: string | null };

async function lastCloseMarker(): Promise<CajaCloseMarker | null> {
  const [row] = await db
    .select({ value: agentMemories.value })
    .from(agentMemories)
    .where(and(eq(agentMemories.scope, "global"), eq(agentMemories.key, CAJA_CLOSE_KEY)))
    .limit(1);
  const value = row?.value as Partial<CajaCloseMarker> | undefined;
  return value && typeof value.closedAt === "string" ? (value as CajaCloseMarker) : null;
}

async function paymentsSummary(from: Date, to: Date) {
  const rows = await db
    .select({ kind: payments.kind, method: payments.method, amount: payments.amount, cancelled: payments.cancelled })
    .from(payments)
    .where(and(gte(payments.date, from), lte(payments.date, to)));
  const byMethod: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  let totalCents = 0;
  let count = 0;
  for (const row of rows) {
    if (row.cancelled) continue;
    const cents = toCents(row.amount);
    totalCents += cents;
    count += 1;
    byMethod[row.method] = (byMethod[row.method] ?? 0) + cents;
    byKind[row.kind] = (byKind[row.kind] ?? 0) + cents;
  }
  const toUnits = (record: Record<string, number>) => Object.fromEntries(Object.entries(record).map(([key, cents]) => [key, cents / 100]));
  return { count, total: totalCents / 100, byMethod: toUnits(byMethod), byKind: toUnits(byKind) };
}

async function pendingBalances() {
  const open = await db
    .select({ id: orders.id, totalQuoted: orders.totalQuoted })
    .from(orders)
    .where(and(ne(orders.status, "cancelado"), ne(orders.status, "borrador")));
  let balanceCents = 0;
  let withBalance = 0;
  for (const order of open) {
    const rows = await db.select({ amount: payments.amount, cancelled: payments.cancelled }).from(payments).where(eq(payments.orderId, order.id));
    const pending = toCents(order.totalQuoted) - sumActivePaymentsCents(rows);
    if (pending > 0) {
      balanceCents += pending;
      withBalance += 1;
    }
  }
  return { orders: withBalance, balance: balanceCents / 100 };
}

// ── Tools ───────────────────────────────────────────────────────────────────

const getCajaStatusInput = z.object({});

export const getCajaStatusTool: AgentTool<z.infer<typeof getCajaStatusInput>> = {
  id: "getCajaStatus",
  description:
    "Estado de caja: cobros desde el último cierre (o desde hoy si nunca se cerró), agrupados por método y tipo (seña/pago/saldo), más saldos pendientes de cobro en pedidos abiertos. Solo lectura.",
  effect: "read",
  inputSchema: getCajaStatusInput,
  async handler() {
    const now = new Date();
    const marker = await lastCloseMarker();
    const from = marker ? new Date(marker.closedAt) : arDayRange(now).from;
    const summary = await paymentsSummary(from, now);
    const pending = await pendingBalances();
    return {
      ok: true as const,
      since: from.toISOString(),
      sinceLabel: marker ? `último cierre ${formatDateTimeAr(marker.closedAt)}` : "hoy (sin cierres previos)",
      collected: summary,
      pendingBalances: pending,
    };
  },
};

const getPaymentsHistoryInput = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  kind: z.enum(["sena", "pago", "saldo"]).optional(),
  includeCancelled: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const getPaymentsHistoryTool: AgentTool<z.infer<typeof getPaymentsHistoryInput>> = {
  id: "getPaymentsHistory",
  description: "Historial de pagos en un rango de fechas, con tipo, método, monto y pedido asociado. Solo lectura.",
  effect: "read",
  inputSchema: getPaymentsHistoryInput,
  async handler({ from, to, kind, includeCancelled, limit }) {
    const filters = [];
    if (from) filters.push(gte(payments.date, new Date(from)));
    if (to) filters.push(lte(payments.date, new Date(to)));
    if (kind) filters.push(eq(payments.kind, kind));
    if (!includeCancelled) filters.push(eq(payments.cancelled, false));
    const rows = await db
      .select({
        id: payments.id,
        orderId: payments.orderId,
        kind: payments.kind,
        method: payments.method,
        amount: payments.amount,
        date: payments.date,
        cancelled: payments.cancelled,
        orderNumber: orders.number,
      })
      .from(payments)
      .leftJoin(orders, eq(payments.orderId, orders.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(payments.date))
      .limit(limit ?? 25);
    return { ok: true as const, count: rows.length, payments: rows.map((row) => ({ ...row, date: row.date.toISOString() })) };
  },
};

const getOrderPaymentsInput = z.object({ orderId: idLike.optional(), number: z.number().int().positive().optional() });

export const getOrderPaymentsTool: AgentTool<z.infer<typeof getOrderPaymentsInput>> = {
  id: "getOrderPayments",
  description: "Pagos de un pedido puntual (por id o número) con totales y saldo. Solo lectura.",
  effect: "read",
  inputSchema: getOrderPaymentsInput,
  async handler({ orderId, number }) {
    const conditions = [];
    if (orderId) conditions.push(eq(orders.id, orderId));
    if (typeof number === "number") conditions.push(eq(orders.number, number));
    if (conditions.length === 0) return { found: false as const, error: "missing_criteria" as const };
    const [order] = await db.select({ id: orders.id, number: orders.number, totalQuoted: orders.totalQuoted }).from(orders).where(or(...conditions)).limit(1);
    if (!order) return { found: false as const, error: "not_found" as const };
    const rows = await db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.date));
    const paidCents = sumActivePaymentsCents(rows);
    const quotedCents = toCents(order.totalQuoted);
    return {
      found: true as const,
      orderId: order.id,
      number: order.number,
      payments: rows.map((row) => ({ ...row, date: row.date.toISOString(), cancelledAt: row.cancelledAt?.toISOString() ?? null })),
      totals: { quoted: quotedCents / 100, paid: paidCents / 100, balance: (quotedCents - paidCents) / 100 },
    };
  },
};

const closeCajaInput = z.object({ note: z.string().trim().max(500).optional() });

const closeCajaInner: AgentTool<z.infer<typeof closeCajaInput>> = {
  id: "closeCaja",
  description:
    "Cierra la caja: calcula los totales desde el último cierre, deja una marca durable y un evento de auditoría. No borra ni modifica pagos. Requiere confirmación.",
  effect: "draft",
  inputSchema: closeCajaInput,
  async handler(input, context) {
    const now = new Date();
    const marker = await lastCloseMarker();
    const from = marker ? new Date(marker.closedAt) : arDayRange(now).from;
    const summary = await paymentsSummary(from, now);

    const value = { closedAt: now.toISOString(), totals: { payments: summary.count, totalCents: Math.round(summary.total * 100) }, closedBy: context.actorRef ?? null };
    await db
      .insert(agentMemories)
      .values({ scope: "global", key: CAJA_CLOSE_KEY, value })
      .onConflictDoUpdate({ target: [agentMemories.scope, agentMemories.key], set: { value } });

    await auditOperatorAction({ toolId: "closeCaja", phase: "executed", args: {}, context, result: { summary } });
    await db.insert(auditEvents).values({
      action: "agent.caja.closed",
      actorKind: "user",
      actorRef: context.actorRef ?? null,
      entityType: "caja",
      payload: { after: { from: from.toISOString(), to: now.toISOString(), ...summary, note: input.note ?? null } },
    });

    return { ok: true as const, closedAt: now.toISOString(), from: from.toISOString(), summary, note: input.note ?? null };
  },
};

export const closeCajaTool = withOperatorConfirmation(closeCajaInner, () => "cerrar la caja y registrar el corte del período");

const getCajaHistoryInput = z.object({ limit: z.number().int().min(1).max(20).optional() });

export const getCajaHistoryTool: AgentTool<z.infer<typeof getCajaHistoryInput>> = {
  id: "getCajaHistory",
  description: "Últimos cierres de caja registrados (con sus totales). Solo lectura.",
  effect: "read",
  inputSchema: getCajaHistoryInput,
  async handler({ limit }) {
    const rows = await db
      .select({ createdAt: auditEvents.createdAt, payload: auditEvents.payload })
      .from(auditEvents)
      .where(eq(auditEvents.action, "agent.caja.closed"))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit ?? 8);
    return {
      ok: true as const,
      count: rows.length,
      closes: rows.map((row) => ({ closedAt: row.createdAt.toISOString(), summary: row.payload?.after ?? null })),
    };
  },
};

// ── A-13 · Physical cash drawer (cash_sessions) ─────────────────────────────

const cashSessionStatusInput = z.object({});

export const getCashSessionStatusTool: AgentTool<z.infer<typeof cashSessionStatusInput>> = {
  id: "getCashSessionStatus",
  description:
    "Estado de la caja física (efectivo): sesión abierta con fondo inicial, cobros en efectivo del período, movimientos manuales y efectivo esperado. Solo lectura. Distinto de getCajaStatus, que resume TODO el ledger de pagos.",
  effect: "read",
  inputSchema: cashSessionStatusInput,
  async handler() {
    const session = await ensureOpenSession();
    const snapshot = await getSnapshot(session.id);
    return {
      ok: true as const,
      sessionId: session.id,
      openedAt: session.openedAt.toISOString(),
      openedAtLabel: formatDateTimeAr(session.openedAt),
      openingCash: snapshot.openingCash,
      cashPayments: snapshot.cashPayments.length,
      cashTotal: snapshot.cashTotal,
      movementsIn: snapshot.movementsIn,
      movementsOut: snapshot.movementsOut,
      expectedCash: snapshot.expectedCash,
      nonCashByMethod: snapshot.nonCashByMethod,
    };
  },
};

const openCashSessionInput = z.object({
  openingCash: z.number().min(0).max(100000000).describe("Fondo inicial de efectivo en el cajón"),
});

const openCashSessionInner: AgentTool<z.infer<typeof openCashSessionInput>> = {
  id: "openCashSession",
  description:
    "Abre la sesión de caja física con el fondo inicial contado. Falla si ya hay una abierta — primero cerrala con closeCashSession. Requiere confirmación.",
  effect: "draft",
  inputSchema: openCashSessionInput,
  async handler(input, context) {
    try {
      const session = await openSession(input.openingCash, context.actorRef ?? undefined);
      await auditOperatorAction({ toolId: "openCashSession", phase: "executed", args: {}, context, result: { sessionId: session.id } });
      await db.insert(auditEvents).values({
        action: "agent.cash_session.opened",
        actorKind: "user",
        actorRef: context.actorRef ?? null,
        entityType: "cash_session",
        entityId: session.id,
        payload: { after: { openingCash: input.openingCash, openedAt: session.openedAt.toISOString() } },
      });
      return { ok: true as const, sessionId: session.id, openedAt: session.openedAt.toISOString(), openingCash: input.openingCash };
    } catch (error) {
      return { ok: false as const, error: "open_failed", message: error instanceof Error ? error.message : "No se pudo abrir la sesión." };
    }
  },
};

export const openCashSessionTool = withOperatorConfirmation(openCashSessionInner, (args) =>
  `abrir la caja física con fondo inicial de ${String(args.openingCash)}`,
);

const addCashMovementInput = z.object({
  direction: z.enum(["in", "out"]).describe("in = entra efectivo al cajón, out = sale"),
  amount: z.number().positive().max(100000000),
  reason: z.string().trim().min(1).max(500).describe("Motivo (ej: 'retiro para cambio', 'gasto de limpieza')"),
});

const addCashMovementInner: AgentTool<z.infer<typeof addCashMovementInput>> = {
  id: "addCashMovement",
  description:
    "Registra un movimiento manual de efectivo (entrada/salida) en la sesión abierta — NO pagos de pedidos (eso lo hace el ledger). Requiere confirmación.",
  effect: "draft",
  inputSchema: addCashMovementInput,
  async handler(input, context) {
    try {
      const movement = await addMovement(input.direction, input.amount, input.reason, context.actorRef ?? undefined);
      await auditOperatorAction({ toolId: "addCashMovement", phase: "executed", args: {}, context, result: { movementId: movement.id } });
      return { ok: true as const, movementId: movement.id, sessionId: movement.sessionId };
    } catch (error) {
      return { ok: false as const, error: "movement_failed", message: error instanceof Error ? error.message : "No se pudo registrar el movimiento." };
    }
  },
};

export const addCashMovementTool = withOperatorConfirmation(addCashMovementInner, (args) =>
  `movimiento de caja ${args.direction === "in" ? "entrada" : "salida"} de ${String(args.amount)}`,
);

const closeCashSessionInput = z.object({
  actualCash: z.number().min(0).max(100000000).describe("Conteo físico real del efectivo en el cajón"),
  note: z.string().trim().max(500).optional(),
});

const closeCashSessionInner: AgentTool<z.infer<typeof closeCashSessionInput>> = {
  id: "closeCashSession",
  description:
    "Cierra la sesión de caja física: compara el efectivo esperado (fondo + cobros efectivo + movimientos) contra el conteo real y congela el asiento. La sesión cerrada es INMUTABLE — una diferencia se ajusta con movimientos en la sesión siguiente. Requiere confirmación.",
  effect: "draft",
  inputSchema: closeCashSessionInput,
  async handler(input, context) {
    const result = await closeSession(input.actualCash, context.actorRef ?? "telegram-operator", input.note);
    if ("error" in result) {
      return { ok: false as const, error: "close_failed", message: result.error };
    }
    await auditOperatorAction({ toolId: "closeCashSession", phase: "executed", args: {}, context, result: { sessionId: result.sessionId, difference: result.difference } });
    await db.insert(auditEvents).values({
      action: "agent.cash_session.closed",
      actorKind: "user",
      actorRef: context.actorRef ?? null,
      entityType: "cash_session",
      entityId: result.sessionId,
      payload: {
        after: {
          expectedCash: result.expectedCash,
          actualCash: result.actualCash,
          difference: result.difference,
          note: input.note ?? null,
        },
      },
    });
    return {
      ok: true as const,
      sessionId: result.sessionId,
      closedAt: result.closedAt.toISOString(),
      expectedCash: result.expectedCash,
      actualCash: result.actualCash,
      difference: result.difference,
      note: result.difference === 0 ? "Arqueo exacto." : "Hay diferencia — revisala y ajustala como movimiento en la próxima sesión con una nota.",
    };
  },
};

export const closeCashSessionTool = withOperatorConfirmation(closeCashSessionInner, (args) =>
  `cerrar la caja física con conteo real de ${String(args.actualCash)}`,
);

export const cashTools = [
  getCajaStatusTool,
  getPaymentsHistoryTool,
  getOrderPaymentsTool,
  closeCajaTool,
  getCajaHistoryTool,
  getCashSessionStatusTool,
  openCashSessionTool,
  addCashMovementTool,
  closeCashSessionTool,
] as const;
