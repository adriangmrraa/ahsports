import "server-only";

import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { orderLines, orders, organizations, payments, products } from "@/db/schema";
import { sumActivePaymentsCents, toCents } from "@/lib/payments";
import type { AgentTool } from "@/lib/agents/tools/types";
import { salesPerformanceTool } from "@/lib/agents/tools/read";
import { arDayRange } from "@/lib/telegram/format";

/**
 * Operator analytics tools — textile mapping of SocialCRM
 * `toolsAnalytics.ts` + `toolsQuery.ts` summaries. All read-only; the numbers
 * always come from the domain tables, never from model memory.
 */

const rangeInput = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const ACTIVE_STATUSES = ["aprobado", "seniado", "en_produccion", "corte", "confeccion", "estampado", "control", "entregado", "bloqueado_pago"] as const;

export const getTopProductsTool: AgentTool<z.infer<typeof rangeInput>> = {
  id: "getTopProducts",
  description: "Productos más vendidos por unidades e importe cotizado en un rango (excluye borradores y cancelados). Solo lectura.",
  effect: "read",
  inputSchema: rangeInput,
  async handler({ from, to, limit }) {
    const filters = [inArray(orders.status, [...ACTIVE_STATUSES])];
    if (from) filters.push(gte(orders.createdAt, new Date(from)));
    if (to) filters.push(lte(orders.createdAt, new Date(to)));

    const rows = await db
      .select({
        productId: orderLines.productId,
        name: products.name,
        sku: products.sku,
        units: sql<number>`coalesce(sum(${orderLines.quantity}), 0)::int`,
        revenue: sql<string>`coalesce(sum(${orderLines.quantity} * ${orderLines.unitPrice}::numeric), 0)`,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orderLines.orderId, orders.id))
      .innerJoin(products, eq(orderLines.productId, products.id))
      .where(and(...filters))
      .groupBy(orderLines.productId, products.name, products.sku)
      .orderBy(desc(sql`sum(${orderLines.quantity})`))
      .limit(limit ?? 10);

    return { ok: true as const, count: rows.length, products: rows };
  },
};

export const getTopCustomersTool: AgentTool<z.infer<typeof rangeInput>> = {
  id: "getTopCustomers",
  description: "Organizaciones con mayor importe cotizado en un rango (excluye borradores y cancelados). Solo lectura.",
  effect: "read",
  inputSchema: rangeInput,
  async handler({ from, to, limit }) {
    const filters = [inArray(orders.status, [...ACTIVE_STATUSES]), sql`${orders.organizationId} is not null`];
    if (from) filters.push(gte(orders.createdAt, new Date(from)));
    if (to) filters.push(lte(orders.createdAt, new Date(to)));

    const rows = await db
      .select({
        organizationId: orders.organizationId,
        name: organizations.name,
        orders: sql<number>`count(*)::int`,
        quoted: sql<string>`coalesce(sum(${orders.totalQuoted}::numeric), 0)`,
      })
      .from(orders)
      .innerJoin(organizations, eq(orders.organizationId, organizations.id))
      .where(and(...filters))
      .groupBy(orders.organizationId, organizations.name)
      .orderBy(desc(sql`sum(${orders.totalQuoted}::numeric)`))
      .limit(limit ?? 10);

    return { ok: true as const, count: rows.length, organizations: rows };
  },
};

const businessSummaryInput = z.object({ date: z.string().datetime().optional() });

export const getBusinessSummaryTool: AgentTool<z.infer<typeof businessSummaryInput>> = {
  id: "getBusinessSummary",
  description:
    "Resumen del día (hora Argentina): pedidos creados, cobrado por método y tipo, pedidos activos por etapa y saldo pendiente. Solo lectura.",
  effect: "read",
  inputSchema: businessSummaryInput,
  async handler({ date }) {
    const { from, to } = arDayRange(date ? new Date(date) : new Date());

    const created = await db.select({ status: orders.status }).from(orders).where(sql`${orders.createdAt} >= ${from} and ${orders.createdAt} < ${to}`);
    const createdByStatus: Record<string, number> = {};
    for (const row of created) createdByStatus[row.status] = (createdByStatus[row.status] ?? 0) + 1;

    const paid = await db
      .select({ kind: payments.kind, method: payments.method, amount: payments.amount, cancelled: payments.cancelled })
      .from(payments)
      .where(sql`${payments.date} >= ${from} and ${payments.date} < ${to}`);
    let collectedCents = 0;
    const byMethod: Record<string, number> = {};
    for (const row of paid) {
      if (row.cancelled) continue;
      const cents = toCents(row.amount);
      collectedCents += cents;
      byMethod[row.method] = (byMethod[row.method] ?? 0) + cents;
    }

    const active = await db.select({ status: orders.status }).from(orders).where(inArray(orders.status, [...ACTIVE_STATUSES]));
    const activeByStatus: Record<string, number> = {};
    for (const row of active) activeByStatus[row.status] = (activeByStatus[row.status] ?? 0) + 1;

    const openOrders = await db
      .select({ id: orders.id, totalQuoted: orders.totalQuoted })
      .from(orders)
      .where(inArray(orders.status, [...ACTIVE_STATUSES]));
    let balanceCents = 0;
    for (const order of openOrders) {
      const rows = await db.select({ amount: payments.amount, cancelled: payments.cancelled }).from(payments).where(eq(payments.orderId, order.id));
      balanceCents += Math.max(0, toCents(order.totalQuoted) - sumActivePaymentsCents(rows));
    }

    return {
      ok: true as const,
      day: { from: from.toISOString(), to: to.toISOString() },
      ordersCreated: { total: created.length, byStatus: createdByStatus },
      collected: { total: collectedCents / 100, byMethod: Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [k, v / 100])) },
      production: { active: active.length, byStatus: activeByStatus },
      pendingBalance: balanceCents / 100,
    };
  },
};

export const analyticsTools = [salesPerformanceTool, getTopProductsTool, getTopCustomersTool, getBusinessSummaryTool] as const;
