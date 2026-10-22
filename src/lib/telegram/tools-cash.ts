import "server-only";

import { and, desc, eq, gte, lte, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { agentMemories, auditEvents, orders, payments } from "@/db/schema";
import { sumActivePaymentsCents, toCents } from "@/lib/payments";
import type { AgentTool } from "@/lib/agents/tools/types";
import { withOperatorConfirmation } from "@/lib/telegram/confirmations";
import { arDayRange, formatDateTimeAr } from "@/lib/telegram/format";
import { auditOperatorAction } from "@/lib/telegram/audit";

/**
 * Operator caja tools — textile mapping of SocialCRM `toolsCash.ts`.
 *
 * AH Sports has no cash-session table: "caja" is the payments ledger plus a
 * durable close marker stored in `agent_memories` (key `caja:last_close`,
 * scope `global`). A close is a reporting checkpoint — it never deletes or
 * mutates payment rows — so the same totals are always re-derivable.
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

export const cashTools = [getCajaStatusTool, getPaymentsHistoryTool, getOrderPaymentsTool, closeCajaTool, getCajaHistoryTool] as const;
