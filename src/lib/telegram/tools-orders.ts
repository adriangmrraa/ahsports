import "server-only";

import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  contacts,
  orderItems,
  orderLines,
  orders,
  organizations,
  payments,
  pricingRules,
  products,
  productionEvents,
} from "@/db/schema";
import { registerPaymentTx, cancelPaymentTx, PaymentDomainError, requiredAdvanceCents, sumActivePaymentsCents, toCents } from "@/lib/payments";
import { quoteOrder } from "@/lib/pricing";
import type { AgentTool } from "@/lib/agents/tools/types";
import { withAuditLog, withOperatorConfirmation } from "@/lib/telegram/confirmations";
import type { DbTransaction } from "@/lib/db-transaction";

/**
 * Operator order tools — textile domain port of SocialCRM `toolsOrder.ts` +
 * `toolsQuery.ts` order reads.
 *
 * Reads are `effect: 'read'`. Mutations split by impact:
 *  - pre-production commercial moves + edits run immediately and audit
 *    (`withAuditLog`);
 *  - production-stage moves, deliveries, cancellations and every payment write
 *    queue a pending action (`withOperatorConfirmation`) that only a
 *    `CONFIRM <token>` releases.
 */

const idLike = z.string().trim().min(1).max(64);
const orderRef = z.object({ orderId: idLike.optional(), number: z.number().int().positive().optional() });
const reasonField = z.string().trim().min(3).max(500).optional();

// ── Order status machine (pure — unit-checkable) ────────────────────────────

export const ORDER_CHAIN = [
  "borrador",
  "presupuesto_enviado",
  "aprobado",
  "seniado",
  "en_produccion",
  "corte",
  "confeccion",
  "estampado",
  "control",
  "entregado",
] as const;

export type OrderChainStatus = (typeof ORDER_CHAIN)[number];
export type AnyOrderStatus = OrderChainStatus | "bloqueado_pago" | "cancelado";

const TERMINAL = new Set<AnyOrderStatus>(["entregado", "cancelado"]);
/** Pre-production positions; backward moves stay inside this window. */
const PRE_PRODUCTION_MAX = ORDER_CHAIN.indexOf("seniado");
/** Order status → production stage fact recorded in production_events. */
const STAGE_FACT: Partial<Record<AnyOrderStatus, "ingreso" | "corte" | "confeccion" | "estampado" | "control" | "entrega">> = {
  en_produccion: "ingreso",
  corte: "corte",
  confeccion: "confeccion",
  estampado: "estampado",
  control: "control",
  entregado: "entrega",
};

/** Targets that queue a pending action instead of executing immediately. */
export const CONFIRM_REQUIRED_STATUSES = new Set<AnyOrderStatus>([
  "en_produccion",
  "corte",
  "confeccion",
  "estampado",
  "control",
  "entregado",
  "cancelado",
]);

export type TransitionPlan =
  | { ok: true; needsPaymentGate: boolean }
  | { ok: false; reason: string };

/**
 * Pure transition decision (docs/04-BUSINESS-RULES §4):
 * - `bloqueado_pago` is auto-only — never a manual target;
 * - terminal states admit no moves;
 * - `cancelado` is reachable from any non-terminal state;
 * - `bloqueado_pago` exits only back to a pre-production state;
 * - forward moves may skip stages (Kanban semantics); backward moves are
 *   allowed only within pre-production;
 * - `en_produccion` additionally requires the seña payment gate (checked by
 *   the caller against live financials).
 */
export function planOrderTransition(current: AnyOrderStatus, target: AnyOrderStatus): TransitionPlan {
  if (current === target) return { ok: false, reason: `El pedido ya está en ${target}.` };
  if (target === "bloqueado_pago") return { ok: false, reason: "bloqueado_pago lo asigna solo el sistema por falta de seña." };
  if (TERMINAL.has(current)) return { ok: false, reason: `Un pedido ${current} no admite cambios de estado.` };
  if (target === "cancelado") return { ok: true, needsPaymentGate: false };

  if (current === "bloqueado_pago") {
    const index = ORDER_CHAIN.indexOf(target as OrderChainStatus);
    if (index >= 0 && index <= PRE_PRODUCTION_MAX) return { ok: true, needsPaymentGate: false };
    return { ok: false, reason: "Un pedido bloqueado por seña solo puede volver a un estado previo a producción." };
  }

  const from = ORDER_CHAIN.indexOf(current as OrderChainStatus);
  const to = ORDER_CHAIN.indexOf(target as OrderChainStatus);
  if (from < 0 || to < 0) return { ok: false, reason: "Transición inválida." };
  if (to > from) {
    // Entering production only from aprobado|seniado, and the seña gate applies.
    if (target === "en_produccion" && current !== "aprobado" && current !== "seniado") {
      return { ok: false, reason: "en_produccion solo es alcanzable desde aprobado o seniado." };
    }
    return { ok: true, needsPaymentGate: target === "en_produccion" };
  }
  // Backward: only within pre-production.
  if (from <= PRE_PRODUCTION_MAX) return { ok: true, needsPaymentGate: false };
  return { ok: false, reason: "Un pedido en producción no puede retroceder de etapa." };
}

// ── Shared loaders ──────────────────────────────────────────────────────────

type OrderRow = typeof orders.$inferSelect;

async function resolveOrder(input: { orderId?: string; number?: number }): Promise<OrderRow | null> {
  const conditions = [];
  if (input.orderId) conditions.push(eq(orders.id, input.orderId));
  if (typeof input.number === "number") conditions.push(eq(orders.number, input.number));
  if (conditions.length === 0) return null;
  const [row] = await db.select().from(orders).where(conditions.length === 1 ? conditions[0] : or(...conditions)).limit(1);
  return row ?? null;
}

async function orderFinancials(orderId: string) {
  const [order] = await db.select({ totalQuoted: orders.totalQuoted }).from(orders).where(eq(orders.id, orderId)).limit(1);
  const rows = await db
    .select({ amount: payments.amount, cancelled: payments.cancelled })
    .from(payments)
    .where(eq(payments.orderId, orderId));
  const paidCents = sumActivePaymentsCents(rows);
  const quotedCents = toCents(order?.totalQuoted ?? "0");
  return { quoted: quotedCents / 100, paid: paidCents / 100, balance: (quotedCents - paidCents) / 100, payments: rows.length };
}

/** minAdvancePercent from the frozen snapshot, the bound rule, or 50. */
async function orderMinAdvancePercent(order: OrderRow): Promise<number> {
  const frozen = order.snapshot?.rule?.minAdvancePercent;
  if (typeof frozen === "number" && Number.isFinite(frozen)) return frozen;
  if (order.pricingRuleId) {
    const [rule] = await db
      .select({ minAdvancePercent: pricingRules.minAdvancePercent })
      .from(pricingRules)
      .where(eq(pricingRules.id, order.pricingRuleId))
      .limit(1);
    if (rule) return Number(rule.minAdvancePercent);
  }
  return 50;
}

async function orderLabel(order: OrderRow): Promise<string> {
  let owner = "";
  if (order.organizationId) {
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, order.organizationId)).limit(1);
    owner = org?.name ?? "";
  }
  if (!owner && order.contactId) {
    const [contact] = await db.select({ name: contacts.name }).from(contacts).where(eq(contacts.id, order.contactId)).limit(1);
    owner = contact?.name ?? "";
  }
  return `#${order.number}${owner ? ` — ${owner}` : ""}`;
}

const orderStatusSchema = z.enum([
  "borrador",
  "presupuesto_enviado",
  "aprobado",
  "seniado",
  "en_produccion",
  "corte",
  "confeccion",
  "estampado",
  "control",
  "entregado",
  "bloqueado_pago",
  "cancelado",
]);

// ── Read tools ──────────────────────────────────────────────────────────────

const listOrdersInput = z.object({
  status: orderStatusSchema.optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const listOrdersTool: AgentTool<z.infer<typeof listOrdersInput>> = {
  id: "listOrders",
  description:
    "Lista pedidos por estado (o todos si no se indica), más recientes primero: número, estado, urgencia, total cotizado, organización/contacto y fecha. Solo lectura.",
  effect: "read",
  inputSchema: listOrdersInput,
  async handler({ status, limit }) {
    const rows = await db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        urgent: orders.urgent,
        totalQuoted: orders.totalQuoted,
        createdAt: orders.createdAt,
        organization: organizations.name,
        contact: contacts.name,
      })
      .from(orders)
      .leftJoin(organizations, eq(orders.organizationId, organizations.id))
      .leftJoin(contacts, eq(orders.contactId, contacts.id))
      .where(status ? eq(orders.status, status) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(limit ?? 10);
    return { ok: true as const, count: rows.length, orders: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
  },
};

const searchOrdersInput = z.object({
  query: z.string().trim().min(2).max(120).optional(),
  status: orderStatusSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const searchOrdersTool: AgentTool<z.infer<typeof searchOrdersInput>> = {
  id: "searchOrders",
  description:
    "Busca pedidos filtrando por estado, rango de fechas y/o texto (nombre de organización, contacto o número exacto). Anti-duplicados en reconcile. Solo lectura.",
  effect: "read",
  inputSchema: searchOrdersInput,
  async handler({ query, status, from, to, limit }) {
    const filters = [];
    if (status) filters.push(eq(orders.status, status));
    if (from) filters.push(gte(orders.createdAt, new Date(from)));
    if (to) filters.push(lte(orders.createdAt, new Date(to)));
    const asNumber = query && /^\d+$/.test(query) ? Number(query) : null;
    if (query) {
      filters.push(
        or(
          ilike(organizations.name, `%${query}%`),
          ilike(contacts.name, `%${query}%`),
          asNumber !== null ? eq(orders.number, asNumber) : undefined,
        ),
      );
    }
    const rows = await db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        totalQuoted: orders.totalQuoted,
        createdAt: orders.createdAt,
        organization: organizations.name,
        contact: contacts.name,
      })
      .from(orders)
      .leftJoin(organizations, eq(orders.organizationId, organizations.id))
      .leftJoin(contacts, eq(orders.contactId, contacts.id))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(limit ?? 15);
    return { ok: true as const, count: rows.length, orders: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
  },
};

const getOrderDetailInput = orderRef;

export const getOrderDetailTool: AgentTool<z.infer<typeof getOrderDetailInput>> = {
  id: "getOrderDetail",
  description:
    "Detalle completo de un pedido por id o número: cabecera, líneas con productos, prendas por talle, pagos y situación financiera. Solo lectura.",
  effect: "read",
  inputSchema: getOrderDetailInput,
  async handler(input) {
    const order = await resolveOrder(input);
    if (!order) return { found: false as const, error: "not_found" as const };

    const lines = await db
      .select({
        id: orderLines.id,
        product: products.name,
        sku: products.sku,
        quantity: orderLines.quantity,
        unitPrice: orderLines.unitPrice,
        unitCost: orderLines.unitCost,
      })
      .from(orderLines)
      .leftJoin(products, eq(orderLines.productId, products.id))
      .where(eq(orderLines.orderId, order.id));

    const lineIds = lines.map((line) => line.id);
    const items = lineIds.length
      ? await db
          .select({ orderLineId: orderItems.orderLineId, sizeId: orderItems.sizeId, status: orderItems.status, individualName: orderItems.individualName, individualNumber: orderItems.individualNumber })
          .from(orderItems)
          .where(inArray(orderItems.orderLineId, lineIds))
      : [];

    const paymentRows = await db
      .select({ id: payments.id, kind: payments.kind, method: payments.method, amount: payments.amount, date: payments.date, cancelled: payments.cancelled })
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .orderBy(desc(payments.date));

    const [contact] = order.contactId
      ? await db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone }).from(contacts).where(eq(contacts.id, order.contactId)).limit(1)
      : [null];
    const [org] = order.organizationId
      ? await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.id, order.organizationId)).limit(1)
      : [null];

    return {
      found: true as const,
      order: {
        id: order.id,
        number: order.number,
        status: order.status,
        urgent: order.urgent,
        notes: order.notes,
        internalNotes: order.internalNotes,
        totalQuoted: order.totalQuoted,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      },
      contact,
      organization: org,
      lines,
      items,
      payments: paymentRows.map((row) => ({ ...row, date: row.date.toISOString() })),
      financials: await orderFinancials(order.id),
    };
  },
};

const getOrderHistoryInput = z.object({
  contactId: idLike.optional(),
  organizationId: idLike.optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const getOrderHistoryTool: AgentTool<z.infer<typeof getOrderHistoryInput>> = {
  id: "getOrderHistory",
  description: "Historial de pedidos de un contacto u organización, más recientes primero. Solo lectura.",
  effect: "read",
  inputSchema: getOrderHistoryInput,
  async handler({ contactId, organizationId, limit }) {
    if (!contactId && !organizationId) return { ok: false as const, error: "missing_criteria" as const };
    const filter = contactId ? eq(orders.contactId, contactId) : eq(orders.organizationId, organizationId!);
    const rows = await db
      .select({ id: orders.id, number: orders.number, status: orders.status, totalQuoted: orders.totalQuoted, createdAt: orders.createdAt })
      .from(orders)
      .where(filter)
      .orderBy(desc(orders.createdAt))
      .limit(limit ?? 10);
    return { ok: true as const, count: rows.length, orders: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
  },
};

const getPendingOrdersInput = z.object({ limit: z.number().int().min(1).max(50).optional() });

export const getPendingOrdersTool: AgentTool<z.infer<typeof getPendingOrdersInput>> = {
  id: "getPendingOrders",
  description: "Pedidos abiertos (no entregados ni cancelados), más antiguos primero — la cola de trabajo de la fábrica. Solo lectura.",
  effect: "read",
  inputSchema: getPendingOrdersInput,
  async handler({ limit }) {
    const rows = await db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        urgent: orders.urgent,
        totalQuoted: orders.totalQuoted,
        createdAt: orders.createdAt,
        organization: organizations.name,
      })
      .from(orders)
      .leftJoin(organizations, eq(orders.organizationId, organizations.id))
      .where(and(ne(orders.status, "entregado"), ne(orders.status, "cancelado")))
      .orderBy(asc(orders.createdAt))
      .limit(limit ?? 15);
    return { ok: true as const, count: rows.length, orders: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
  },
};

const getProductionQueueInput = z.object({});

export const getProductionQueueTool: AgentTool<z.infer<typeof getProductionQueueInput>> = {
  id: "getProductionQueue",
  description: "Resumen de la cola de producción: cantidad de pedidos por etapa productiva y lista de urgentes. Solo lectura.",
  effect: "read",
  inputSchema: getProductionQueueInput,
  async handler() {
    const rows = await db.select({ status: orders.status, id: orders.id, number: orders.number, urgent: orders.urgent }).from(orders).where(
      and(ne(orders.status, "entregado"), ne(orders.status, "cancelado"), ne(orders.status, "borrador")),
    );
    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    const urgent = rows.filter((row) => row.urgent).map((row) => row.number);
    return { ok: true as const, open: rows.length, byStatus, urgent };
  },
};

// ── Mutations ───────────────────────────────────────────────────────────────

const updateOrderStatusInput = orderRef.extend({
  status: orderStatusSchema,
  reason: reasonField,
});

async function applyOrderStatus(order: OrderRow, target: AnyOrderStatus, reason: string | undefined, actorRef: string | null | undefined) {
  const plan = planOrderTransition(order.status as AnyOrderStatus, target);
  if (!plan.ok) return { ok: false as const, error: "invalid_transition" as const, message: plan.reason };

  if (plan.needsPaymentGate) {
    const [financials, minAdvance] = await Promise.all([
      (async () => {
        const rows = await db.select({ amount: payments.amount, cancelled: payments.cancelled }).from(payments).where(eq(payments.orderId, order.id));
        return sumActivePaymentsCents(rows);
      })(),
      orderMinAdvancePercent(order),
    ]);
    const required = requiredAdvanceCents(toCents(order.totalQuoted), minAdvance);
    if (financials < required) {
      return {
        ok: false as const,
        error: "payment_gate" as const,
        message: `El pedido no alcanza la seña mínima (${minAdvance}%): falta registrar ${((required - financials) / 100).toFixed(2)}. Quedaría bloqueado_pago.`,
      };
    }
  }

  const { withDbTransaction } = await import("@/lib/db-transaction");
  await withDbTransaction(async (tx) => {
    await tx.update(orders).set({ status: target, updatedAt: new Date() }).where(eq(orders.id, order.id));
    const stage = STAGE_FACT[target];
    if (stage) {
      await tx.insert(productionEvents).values({ orderId: order.id, stage, note: reason ?? `bot: ${order.status} → ${target}`, userId: actorRef ?? null });
    }
  });

  await notifyCustomerStatusQuietly(order.id, target);

  return { ok: true as const, orderId: order.id, number: order.number, from: order.status, to: target };
}

/**
 * A-04: best-effort customer notification after a committed status change.
 * The operator action already succeeded, so a failed send is logged and never
 * reported as a failed transition.
 */
async function notifyCustomerStatusQuietly(orderId: string, status: string): Promise<void> {
  try {
    const { notifyOrderStatusChange } = await import("@/lib/whatsapp/order-status-notify");
    const notified = await notifyOrderStatusChange(orderId, status);
    if (!notified.ok) {
      console.warn(
        `[telegram/orders] customer notification not sent for order ${orderId.slice(0, 8)}… (${notified.error})`,
      );
    }
  } catch {
    console.warn(`[telegram/orders] customer notification failed for order ${orderId.slice(0, 8)}…`);
  }
}

const updateOrderStatusInner: AgentTool<z.infer<typeof updateOrderStatusInput>> = {
  id: "updateOrderStatus",
  description:
    "Cambia el estado de un pedido respetando la máquina de estados (documentación §4). Movimientos a producción/entrega/cancelado requieren confirmación; movimientos comerciales (presupuesto/aprobado/señado) ejecutan directo con auditoría.",
  effect: "draft",
  inputSchema: updateOrderStatusInput,
  async handler(input, context) {
    const order = await resolveOrder(input);
    if (!order) return { ok: false as const, error: "not_found" as const, message: "No encontré ese pedido." };
    const result = await applyOrderStatus(order, input.status as AnyOrderStatus, input.reason, context.actorRef);
    if (!result.ok) return result;
    return { ...result, label: await orderLabel(order) };
  },
};

/** One tool, two gates: low-impact targets run audited; the rest queue a pending action. */
export const updateOrderStatusTool: AgentTool<z.infer<typeof updateOrderStatusInput>> = {
  ...updateOrderStatusInner,
  async handler(input, context) {
    if (CONFIRM_REQUIRED_STATUSES.has(input.status as AnyOrderStatus)) {
      const gated = withOperatorConfirmation(updateOrderStatusInner, (args) => {
        const ref = args.orderId ? `pedido ${String(args.orderId).slice(0, 8)}…` : `pedido #${String(args.number)}`;
        return `cambiar estado de ${ref} a ${String(args.status)}${args.reason ? ` (${String(args.reason).slice(0, 120)})` : ""}`;
      });
      return gated.handler(input, context);
    }
    const audited = withAuditLog(updateOrderStatusInner);
    return audited.handler(input, context);
  },
};

const cancelOrderInput = orderRef.extend({ reason: reasonField });

const cancelOrderInner: AgentTool<z.infer<typeof cancelOrderInput>> = {
  id: "cancelOrder",
  description: "Cancela un pedido (estado terminal manual). No se puede cancelar un pedido entregado.",
  effect: "draft",
  inputSchema: cancelOrderInput,
  async handler(input, context) {
    const order = await resolveOrder(input);
    if (!order) return { ok: false as const, error: "not_found" as const, message: "No encontré ese pedido." };
    const result = await applyOrderStatus(order, "cancelado", input.reason, context.actorRef);
    if (!result.ok) return result;
    return { ...result, label: await orderLabel(order) };
  },
};

export const cancelOrderTool = withOperatorConfirmation(cancelOrderInner, (args) => {
  const ref = args.orderId ? `pedido ${String(args.orderId).slice(0, 8)}…` : `pedido #${String(args.number)}`;
  return `CANCELAR ${ref}${args.reason ? ` — motivo: ${String(args.reason).slice(0, 120)}` : ""}`;
});

const updateOrderNotesInput = orderRef.extend({
  notes: z.string().trim().max(4000).optional(),
  internalNotes: z.string().trim().max(4000).optional(),
});

export const updateOrderNotesTool = withAuditLog({
  id: "updateOrderNotes",
  description: "Actualiza las notas públicas y/o internas de un pedido. Reversible, queda auditado.",
  effect: "draft",
  inputSchema: updateOrderNotesInput,
  async handler(input) {
    if (input.notes === undefined && input.internalNotes === undefined) {
      return { ok: false as const, error: "nothing_to_update" as const };
    }
    const order = await resolveOrder(input);
    if (!order) return { ok: false as const, error: "not_found" as const };
    const fields: Record<string, unknown> = { updatedAt: new Date() };
    if (input.notes !== undefined) fields.notes = input.notes;
    if (input.internalNotes !== undefined) fields.internalNotes = input.internalNotes;
    await db.update(orders).set(fields).where(eq(orders.id, order.id));
    return { ok: true as const, orderId: order.id, number: order.number };
  },
} satisfies AgentTool<z.infer<typeof updateOrderNotesInput>>);

const setOrderUrgentInput = orderRef.extend({ urgent: z.boolean() });

export const setOrderUrgentTool = withAuditLog({
  id: "setOrderUrgent",
  description: "Marca o desmarca un pedido como urgente. Reversible, queda auditado.",
  effect: "draft",
  inputSchema: setOrderUrgentInput,
  async handler(input) {
    const order = await resolveOrder(input);
    if (!order) return { ok: false as const, error: "not_found" as const };
    await db.update(orders).set({ urgent: input.urgent, updatedAt: new Date() }).where(eq(orders.id, order.id));
    return { ok: true as const, orderId: order.id, number: order.number, urgent: input.urgent };
  },
} satisfies AgentTool<z.infer<typeof setOrderUrgentInput>>);

const reQuoteInput = orderRef.extend({
  urgent: z.boolean().optional(),
  lines: z
    .array(z.object({ productId: idLike, quantity: z.number().int().positive().max(100000), techniqueId: idLike.nullish(), sizeId: idLike.nullish() }))
    .min(1)
    .max(20),
});

/**
 * Rebuilds a `borrador` order's lines + frozen snapshot through the pricing
 * engine (covers SocialCRM addItemToOrder/removeItemFromOrder: the model
 * recomputes the desired line set). Draft-only: refuses non-borrador orders.
 */
const reQuoteInner: AgentTool<z.infer<typeof reQuoteInput>> = {
  id: "reQuoteOrder",
  description:
    "Recotiza un pedido en estado borrador: reemplaza sus líneas y el snapshot con el resultado del motor de precios. Solo opera sobre borradores; nunca toca producción ni pagos.",
  effect: "draft",
  inputSchema: reQuoteInput,
  async handler(input) {
    const order = await resolveOrder(input);
    if (!order) return { ok: false as const, error: "not_found" as const, message: "No encontré ese pedido." };
    if (order.status !== "borrador") {
      return { ok: false as const, error: "not_draft" as const, message: `Solo se puede recotizar un pedido en borrador (está en ${order.status}).` };
    }
    let quote;
    try {
      quote = await quoteOrder({
        urgent: input.urgent ?? order.urgent,
        lines: input.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, techniqueId: line.techniqueId ?? null, sizeId: line.sizeId ?? null })),
      });
    } catch (error) {
      return { ok: false as const, error: "quote_failed" as const, message: error instanceof Error ? error.message.slice(0, 300) : "No se pudo recotizar." };
    }

    const { withDbTransaction } = await import("@/lib/db-transaction");
    await withDbTransaction(async (tx) => {
      const history = [...(order.snapshotHistory ?? [])];
      if (order.snapshot) history.push({ snapshot: order.snapshot, supersededAt: new Date().toISOString(), reason: "re-quote" });
      await tx.delete(orderLines).where(eq(orderLines.orderId, order.id));
      await tx.insert(orderLines).values(
        quote.lines.map((line) => ({
          orderId: order.id,
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice.toFixed(2),
          unitCost: line.unitCost.toFixed(2),
        })),
      );
      await tx
        .update(orders)
        .set({
          snapshot: quote.snapshot,
          snapshotHistory: history,
          totalQuoted: quote.totals.price.toFixed(2),
          totalCost: quote.totals.cost.toFixed(2),
          marginPercent: quote.totals.marginPercent.toFixed(2),
          pricingRuleId: quote.rule.id,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
    });

    return { ok: true as const, orderId: order.id, number: order.number, lines: quote.lines.length, totals: quote.totals };
  },
};

export const reQuoteOrderTool = withAuditLog(reQuoteInner);

const registerPaymentInput = orderRef.extend({
  amount: z.number().positive().max(1_000_000_000),
  kind: z.enum(["sena", "pago", "saldo"]),
  method: z.enum(["efectivo", "transferencia", "cheque", "mercadopago", "otro"]),
  reference: z.string().trim().max(128).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const registerPaymentInner: AgentTool<z.infer<typeof registerPaymentInput>> = {
  id: "registerPayment",
  description:
    "Registra una seña/pago/saldo en un pedido y recalcula el bloqueo por seña en la misma transacción. Escritura financiera: requiere confirmación.",
  effect: "draft",
  inputSchema: registerPaymentInput,
  async handler(input, context) {
    const order = await resolveOrder(input);
    if (!order) return { ok: false as const, error: "not_found" as const, message: "No encontré ese pedido." };
    try {
      const { withDbTransaction } = await import("@/lib/db-transaction");
      const result = await withDbTransaction(async (tx: DbTransaction) =>
        registerPaymentTx(tx, {
          orderId: order.id,
          kind: input.kind,
          method: input.method,
          amount: input.amount,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          createdById: context.actorRef ?? null,
        }),
      );
      if (result.statusChanged) {
        await notifyCustomerStatusQuietly(order.id, result.status);
      }
      const rows = await db.select({ amount: payments.amount, cancelled: payments.cancelled }).from(payments).where(eq(payments.orderId, order.id));
      const paidCents = sumActivePaymentsCents(rows);
      const balanceCents = toCents(order.totalQuoted) - paidCents;
      return {
        ok: true as const,
        paymentId: result.paymentId,
        orderId: order.id,
        number: order.number,
        status: result.status,
        statusChanged: result.statusChanged,
        balance: balanceCents / 100,
      };
    } catch (error) {
      if (error instanceof PaymentDomainError) {
        return { ok: false as const, error: "payment_rejected" as const, message: error.message };
      }
      throw error;
    }
  },
};

export const registerPaymentTool = withOperatorConfirmation(registerPaymentInner, (args) => {
  const ref = args.orderId ? `pedido ${String(args.orderId).slice(0, 8)}…` : `pedido #${String(args.number)}`;
  return `registrar ${String(args.kind)} de $${Number(args.amount).toLocaleString("es-AR")} (${String(args.method)}) en ${ref}`;
});

const cancelPaymentInput = z.object({
  paymentId: idLike,
  reason: reasonField,
});

const cancelPaymentInner: AgentTool<z.infer<typeof cancelPaymentInput>> = {
  id: "cancelPayment",
  description: "Cancela (soft-delete) un pago registrado y recalcula el bloqueo por seña. Escritura financiera: requiere confirmación.",
  effect: "draft",
  inputSchema: cancelPaymentInput,
  async handler(input, context) {
    try {
      const { withDbTransaction } = await import("@/lib/db-transaction");
      const result = await withDbTransaction(async (tx: DbTransaction) => cancelPaymentTx(tx, input.paymentId, context.actorRef ?? null));
      if (result.statusChanged) {
        await notifyCustomerStatusQuietly(result.orderId, result.status);
      }
      return { ok: true as const, paymentId: input.paymentId, orderId: result.orderId, status: result.status, statusChanged: result.statusChanged };
    } catch (error) {
      if (error instanceof PaymentDomainError) {
        return { ok: false as const, error: "payment_rejected" as const, message: error.message };
      }
      throw error;
    }
  },
};

export const cancelPaymentTool = withOperatorConfirmation(cancelPaymentInner, (args) => `cancelar el pago ${String(args.paymentId).slice(0, 8)}…`);

// Re-export for tool assembly.
export const orderReadTools = [listOrdersTool, searchOrdersTool, getOrderDetailTool, getOrderHistoryTool, getPendingOrdersTool, getProductionQueueTool] as const;
export const orderMutationTools = [updateOrderStatusTool, cancelOrderTool, updateOrderNotesTool, setOrderUrgentTool, reQuoteOrderTool, registerPaymentTool, cancelPaymentTool] as const;
