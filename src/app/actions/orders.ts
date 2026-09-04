"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { orderItems, orderLines, orders, payments, pricingRules, products, sizes, techniques } from "@/db/schema";
import type { SnapshotHistoryEntry } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { generatePublicToken } from "@/lib/utils";
import { quoteOrder } from "@/lib/pricing";
import { confirmQuoteSchema, createOrderLineSchema, orderSchema, reQuoteOrderSchema } from "@/lib/validators";
import { eq } from "drizzle-orm";

export async function createOrder(input: unknown) {
  const user = await requireUser();
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }
  const d = parsed.data;
  // Neon HTTP: sin tx — insert único secuencial.
  const [row] = await db
    .insert(orders)
    .values({
      publicToken: generatePublicToken(),
      organizationId: d.organizationId ?? null,
      contactId: d.contactId ?? null,
      status: d.status,
      urgent: d.urgent,
      notes: d.notes,
      internalNotes: d.internalNotes ?? null,
      pricingRuleId: d.pricingRuleId ?? null,
      createdById: user.id,
    })
    .returning({ id: orders.id });
  if (!row) {
    return { ok: false as const, error: "No se pudo crear el pedido" };
  }
  revalidatePath("/admin/pedidos");
  redirect(`/admin/pedidos/${row.id}`);
}

const LINE_EDITABLE_STATUS = ["borrador", "presupuesto_enviado", "aprobado"] as const;

export async function createOrderLine(input: unknown) {
  await requireUser();
  const parsed = createOrderLineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }
  const d = parsed.data;

  // 2. Order debe existir y estar en estado editable.
  const [order] = await db.select().from(orders).where(eq(orders.id, d.orderId)).limit(1);
  if (!order) return { ok: false as const, error: "Pedido no encontrado" };
  if (!(LINE_EDITABLE_STATUS as readonly string[]).includes(order.status)) {
    return { ok: false as const, error: `No se puede agregar líneas en estado ${order.status}` };
  }

  // 3. FKs: producto activo; técnica opcional existente; talles del producto.
  const [product] = await db.select().from(products).where(eq(products.id, d.productId)).limit(1);
  if (!product) return { ok: false as const, error: "Producto no encontrado" };
  if (!product.active) return { ok: false as const, error: "Producto inactivo" };
  if (d.techniqueId) {
    const [tech] = await db.select({ id: techniques.id }).from(techniques).where(eq(techniques.id, d.techniqueId)).limit(1);
    if (!tech) return { ok: false as const, error: "Técnica no encontrada" };
  }
  const productSizes = await db.select().from(sizes).where(eq(sizes.productId, d.productId));
  const sizeIds = new Set(productSizes.map((s) => s.id));
  const entries = Object.entries(d.sizeQuantities ?? {}).filter(([, q]) => q > 0);
  for (const [sizeId] of entries) {
    if (!sizeIds.has(sizeId)) return { ok: false as const, error: "Talle inválido para este producto" };
  }

  // 4. Cantidad total: suma por talles o cantidad directa (producto sin talles).
  const totalQty = entries.length > 0
    ? entries.reduce((acc, [, q]) => acc + q, 0)
    : (d.quantity ?? 0);
  if (totalQty <= 0) return { ok: false as const, error: "Cantidad inválida" };

  // 5. Writes secuenciales (Neon HTTP: sin tx) — línea + items.
  const [line] = await db
    .insert(orderLines)
    .values({
      orderId: d.orderId,
      productId: d.productId,
      techniqueId: d.techniqueId ?? null,
      quantity: totalQty,
      unitPrice: String(product.basePrice),
      unitCost: "0",
      notes: d.notes ?? null,
    })
    .returning({ id: orderLines.id });
  if (!line) return { ok: false as const, error: "No se pudo crear la línea" };

  if (entries.length > 0) {
    for (const [sizeId, qty] of entries) {
      for (let i = 0; i < qty; i++) {
        await db.insert(orderItems).values({ orderLineId: line.id, sizeId });
      }
    }
  } else {
    for (let i = 0; i < totalQty; i++) {
      await db.insert(orderItems).values({ orderLineId: line.id, sizeId: null });
    }
  }

  // 6. Revalida ficha + planilla.
  revalidatePath(`/admin/pedidos/${d.orderId}`);
  revalidatePath(`/admin/pedidos/${d.orderId}/planilla`);
  revalidatePath(`/admin/pedidos/${d.orderId}/ficha-tecnica`);
  return { ok: true as const, lineId: line.id, itemCount: totalQty };
}

type QuoteActionError = { ok: false; error: string; issues?: unknown };

async function loadQuotableLines(orderId: string) {
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId));
  return lines;
}

/**
 * F3-16 — Confirma cotización recalculando server-side con quoteOrder().
 * NUNCA confía en totales enviados por el cliente: el único input es orderId
 * (+pricingRuleId opcional). Writes secuenciales (Neon HTTP: sin tx):
 * líneas → snapshot/history → pedido.
 */
export async function confirmQuote(input: unknown): Promise<{ ok: true; status: string } | QuoteActionError> {
  await requireUser();
  const parsed = confirmQuoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }
  const { orderId, pricingRuleId } = parsed.data;

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { ok: false as const, error: "Pedido no encontrado" };

  const dbLines = await loadQuotableLines(orderId);
  if (dbLines.length === 0) {
    return { ok: false as const, error: "El pedido no tiene líneas para cotizar" };
  }

  let quote;
  try {
    quote = await quoteOrder({
      lines: dbLines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        sizeId: null,
        techniqueId: l.techniqueId,
      })),
      urgent: order.urgent,
      pricingRuleId: pricingRuleId ?? undefined,
    });
  } catch {
    return { ok: false as const, error: "No hay regla de pricing activa. Configurala en /admin/configuracion." };
  }

  // 1. Actualiza líneas con costo/precio recalculados (mismo orden del input;
  // FK garantiza que ningún producto falta, el índice se mantiene alineado).
  // Neon HTTP: sin tx — secuencial con comentario.
  for (let i = 0; i < dbLines.length; i++) {
    const ql = quote.lines[i];
    if (!ql) continue;
    await db
      .update(orderLines)
      .set({ unitPrice: String(ql.unitPrice), unitCost: String(ql.unitCost) })
      .where(eq(orderLines.id, dbLines[i].id));
  }

  // 2. Append del snapshot previo al historial (solo si existe).
  const history = [...(order.snapshotHistory ?? [])];
  if (order.snapshot) {
    const entry: SnapshotHistoryEntry = {
      snapshot: order.snapshot,
      supersededAt: new Date().toISOString(),
      reason: "confirm",
    };
    history.push(entry);
  }

  // 3. Bloqueo por seña: minAdvance de la regla freezada en el snapshot vigente
  // (la recién calculada); si el pedido aún no tenía snapshot se usa la activa,
  // que es la misma que quoteOrder() usó para este cálculo.
  const minAdvance = quote.rule.minAdvancePercent;
  const pays = await db.select().from(payments).where(eq(payments.orderId, orderId));
  const totalPagado = pays.reduce((acc, p) => acc + Number(p.amount), 0);
  const required = (quote.totals.price * minAdvance) / 100;

  const nextStatus =
    totalPagado < required
      ? "bloqueado_pago"
      : order.status === "borrador"
        ? "presupuesto_enviado"
        : order.status;

  await db
    .update(orders)
    .set({
      totalQuoted: String(quote.totals.price),
      totalCost: String(quote.totals.cost),
      marginPercent: String(quote.totals.marginPercent),
      snapshot: quote.snapshot,
      snapshotHistory: history,
      pricingRuleId: quote.rule.id,
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath(`/admin/pedidos/${orderId}/cotizar`);
  return { ok: true as const, status: nextStatus };
}

const REQUOTE_BLOCKED_STATUS = ["entregado", "cancelado"] as const;

/**
 * F3-17 — Re-cotiza con flag urgente explícito. Guards: rechaza pedidos
 * entregados/cancelados. Append a history SIN cambiar status.
 */
export async function reQuoteOrder(input: unknown): Promise<{ ok: true } | QuoteActionError> {
  await requireUser();
  const parsed = reQuoteOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }
  const { orderId, urgent } = parsed.data;

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { ok: false as const, error: "Pedido no encontrado" };
  if ((REQUOTE_BLOCKED_STATUS as readonly string[]).includes(order.status)) {
    return { ok: false as const, error: `No se puede re-cotizar un pedido ${order.status}` };
  }

  const dbLines = await loadQuotableLines(orderId);
  if (dbLines.length === 0) {
    return { ok: false as const, error: "El pedido no tiene líneas para cotizar" };
  }

  // Regla: vigente del snapshot si existe (trazabilidad D6/D8), o activa.
  let ruleId: string | undefined;
  if (order.snapshot) {
    const [frozen] = await db
      .select({ id: pricingRules.id })
      .from(pricingRules)
      .where(eq(pricingRules.id, order.snapshot.rule.id))
      .limit(1);
    if (frozen) ruleId = frozen.id;
  }

  let quote;
  try {
    quote = await quoteOrder({
      lines: dbLines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        sizeId: null,
        techniqueId: l.techniqueId,
      })),
      urgent,
      pricingRuleId: ruleId,
    });
  } catch {
    return { ok: false as const, error: "No hay regla de pricing activa. Configurala en /admin/configuracion." };
  }

  // Neon HTTP: sin tx — secuencial: líneas → pedido (status intacto).
  for (let i = 0; i < dbLines.length; i++) {
    const ql = quote.lines[i];
    if (!ql) continue;
    await db
      .update(orderLines)
      .set({ unitPrice: String(ql.unitPrice), unitCost: String(ql.unitCost) })
      .where(eq(orderLines.id, dbLines[i].id));
  }

  const history = [...(order.snapshotHistory ?? [])];
  if (order.snapshot) {
    const entry: SnapshotHistoryEntry = {
      snapshot: order.snapshot,
      supersededAt: new Date().toISOString(),
      reason: "re-quote",
    };
    history.push(entry);
  }

  await db
    .update(orders)
    .set({
      urgent,
      totalQuoted: String(quote.totals.price),
      totalCost: String(quote.totals.cost),
      marginPercent: String(quote.totals.marginPercent),
      snapshot: quote.snapshot,
      snapshotHistory: history,
      pricingRuleId: quote.rule.id,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath(`/admin/pedidos/${orderId}/cotizar`);
  return { ok: true as const };
}
