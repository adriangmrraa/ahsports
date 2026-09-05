import { and, eq } from "drizzle-orm";
import { orders, paymentEvents, payments } from "@/db/schema";
import type { DbTransaction } from "@/lib/db-transaction";

/**
 * F5 / Phase 3 — Verdad financiera compartida.
 *
 * Todo monto se opera en centavos enteros: los `numeric(14,2)` de Drizzle
 * llegan como string y NUNCA se suman como float. Los pagos cancelados
 * (soft-delete) no cuentan para totales ni para el gate de seña.
 */

// --- Decimal-safe money ---------------------------------------------------

/** "1234.56" -> 123456. Lanza si el formato no es un decimal válido. */
export function toCents(value: string | number): number {
  const raw = typeof value === "number" ? String(value) : value;
  const match = /^(-?\d+)(?:\.(\d{1,2}))?$/.exec(raw.trim());
  if (!match) throw new Error(`Monto inválido: ${raw}`);
  const sign = match[1].startsWith("-") ? -1 : 1;
  const whole = Number(match[1].replace("-", ""));
  const frac = Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(frac)) {
    throw new Error(`Monto fuera de rango: ${raw}`);
  }
  return sign * (whole * 100 + frac);
}

/** 123456 -> "1234.56" (formato apto para columnas numeric). */
export function fromCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error(`Centavos fuera de rango: ${cents}`);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Suma solo pagos activos (cancelled=false). */
export function sumActivePaymentsCents(rows: Array<{ amount: string; cancelled: boolean }>): number {
  let total = 0;
  for (const row of rows) {
    if (row.cancelled) continue;
    total += toCents(row.amount);
  }
  return total;
}

// --- Gate de seña / bloqueo -------------------------------------------------

/**
 * Seña requerida en centavos: total * minAdvancePercent / 100.
 * minAdvancePercent llega como string con hasta 2 decimales ("50", "37.5").
 */
export function requiredAdvanceCents(totalQuotedCents: number, minAdvancePercent: string | number): number {
  const pct = typeof minAdvancePercent === "number" ? minAdvancePercent : Number(minAdvancePercent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new Error(`minAdvancePercent inválido: ${minAdvancePercent}`);
  }
  return Math.ceil((totalQuotedCents * Math.round(pct * 100)) / 10000);
}

const UNBLOCK_FROM = ["bloqueado_pago"] as const;
const REBLOCK_FROM = ["aprobado", "presupuesto_enviado", "seniado"] as const;
const FROZEN_STATUS = ["en_produccion", "corte", "confeccion", "estampado", "control", "entregado", "cancelado"] as const;

export type BlockGateInput = {
  status: string;
  totalQuoted: string | number;
  minAdvancePercent: string | number;
  activeTotalCents: number;
};

export type BlockGateResult = { status: string; changed: boolean };

/**
 * Recalcula el bloqueo por seña (F5-04/F5-06, reutilizable en API y actions).
 * Solo transiciona entre `bloqueado_pago` <-> estados de pre-producción;
 * los estados productivos/finales NUNCA se tocan desde acá.
 */
export function recalculateBlockStatus(input: BlockGateInput): BlockGateResult {
  const { status } = input;
  if ((FROZEN_STATUS as readonly string[]).includes(status)) {
    return { status, changed: false };
  }
  const required = requiredAdvanceCents(toCents(input.totalQuoted), input.minAdvancePercent);
  const meets = input.activeTotalCents >= required;
  if (!meets && (REBLOCK_FROM as readonly string[]).includes(status)) {
    return { status: "bloqueado_pago", changed: true };
  }
  if (!meets && status === "borrador") {
    return { status: "bloqueado_pago", changed: true };
  }
  if (meets && (UNBLOCK_FROM as readonly string[]).includes(status)) {
    return { status: "aprobado", changed: true };
  }
  return { status, changed: false };
}

// --- Operaciones transaccionales ---------------------------------------------

export type PaymentInput = {
  orderId: string;
  kind: "sena" | "pago" | "saldo";
  method: "efectivo" | "transferencia" | "cheque" | "mercadopago" | "otro";
  amount: number;
  reference?: string | null;
  notes?: string | null;
  createdById?: string | null;
};

export class PaymentDomainError extends Error {}

type OrderGateRow = {
  id: string;
  status: string;
  totalQuoted: string;
  minAdvancePercent: string | null;
};

/** Lee el gate vigente: snapshot freezado si existe, si no la regla indicada. */
async function loadOrderGate(
  tx: DbTransaction,
  orderId: string,
  pricingRuleId?: string | null,
): Promise<OrderGateRow> {
  const { pricingRules } = await import("@/db/schema");
  const [order] = await tx
    .select({
      id: orders.id,
      status: orders.status,
      totalQuoted: orders.totalQuoted,
      pricingRuleId: orders.pricingRuleId,
      snapshot: orders.snapshot,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) throw new PaymentDomainError("Pedido no encontrado");
  const frozen = order.snapshot?.rule.minAdvancePercent;
  if (frozen !== undefined) {
    return { id: order.id, status: order.status, totalQuoted: order.totalQuoted, minAdvancePercent: String(frozen) };
  }
  const ruleId = pricingRuleId ?? order.pricingRuleId;
  if (!ruleId) throw new PaymentDomainError("El pedido no tiene regla de pricing para evaluar la seña");
  const [rule] = await tx
    .select({ minAdvancePercent: pricingRules.minAdvancePercent })
    .from(pricingRules)
    .where(eq(pricingRules.id, ruleId))
    .limit(1);
  if (!rule) throw new PaymentDomainError("Regla de pricing no encontrada");
  return { id: order.id, status: order.status, totalQuoted: order.totalQuoted, minAdvancePercent: rule.minAdvancePercent };
}

/**
 * Registra un pago + evento de auditoría + recálculo de bloqueo, todo atómico.
 * Debe llamarse dentro de `withDbTransaction`.
 */
export async function registerPaymentTx(tx: DbTransaction, input: PaymentInput) {
  const gate = await loadOrderGate(tx, input.orderId);
  if (gate.status === "cancelado" || gate.status === "entregado") {
    throw new PaymentDomainError(`No se puede cobrar un pedido ${gate.status}`);
  }
  const [payment] = await tx
    .insert(payments)
    .values({
      orderId: input.orderId,
      kind: input.kind,
      method: input.method,
      amount: fromCents(Math.round(input.amount * 100)),
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      createdById: input.createdById ?? null,
    })
    .returning({ id: payments.id, amount: payments.amount });
  if (!payment) throw new PaymentDomainError("No se pudo registrar el pago");
  await tx.insert(paymentEvents).values({
    paymentId: payment.id,
    orderId: input.orderId,
    type: "registered",
    amount: payment.amount,
    createdById: input.createdById ?? null,
  });
  const rows = await tx
    .select({ amount: payments.amount, cancelled: payments.cancelled })
    .from(payments)
    .where(eq(payments.orderId, input.orderId));
  const next = recalculateBlockStatus({
    status: gate.status,
    totalQuoted: gate.totalQuoted,
    minAdvancePercent: gate.minAdvancePercent ?? "50",
    activeTotalCents: sumActivePaymentsCents(rows),
  });
  if (next.changed) {
    await tx.update(orders).set({ status: next.status as "bloqueado_pago" | "aprobado", updatedAt: new Date() }).where(eq(orders.id, input.orderId));
  }
  return { paymentId: payment.id, status: next.status, statusChanged: next.changed };
}

/**
 * Cancela un pago (soft) + evento de auditoría + recálculo de bloqueo.
 * El monto cancelado deja de contar sin alterar la etapa operativa.
 */
export async function cancelPaymentTx(tx: DbTransaction, paymentId: string, cancelledById?: string | null) {
  const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!payment) throw new PaymentDomainError("Pago no encontrado");
  if (payment.cancelled) throw new PaymentDomainError("El pago ya está cancelado");
  const gate = await loadOrderGate(tx, payment.orderId);
  const now = new Date();
  await tx
    .update(payments)
    .set({ cancelled: true, cancelledAt: now, cancelledBy: cancelledById ?? null })
    .where(and(eq(payments.id, paymentId), eq(payments.cancelled, false)));
  await tx.insert(paymentEvents).values({
    paymentId: payment.id,
    orderId: payment.orderId,
    type: "cancelled",
    amount: payment.amount,
    createdById: cancelledById ?? null,
  });
  const rows = await tx
    .select({ amount: payments.amount, cancelled: payments.cancelled })
    .from(payments)
    .where(eq(payments.orderId, payment.orderId));
  const next = recalculateBlockStatus({
    status: gate.status,
    totalQuoted: gate.totalQuoted,
    minAdvancePercent: gate.minAdvancePercent ?? "50",
    activeTotalCents: sumActivePaymentsCents(rows),
  });
  if (next.changed) {
    await tx.update(orders).set({ status: next.status as "bloqueado_pago" | "aprobado", updatedAt: new Date() }).where(eq(orders.id, payment.orderId));
  }
  return { orderId: payment.orderId, status: next.status, statusChanged: next.changed };
}

/** Totales financieros de un pedido excluyendo cancelados. */
export async function getOrderFinancials(tx: DbTransaction, orderId: string) {
  const [order] = await tx
    .select({ totalQuoted: orders.totalQuoted })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) throw new PaymentDomainError("Pedido no encontrado");
  const rows = await tx
    .select({ amount: payments.amount, cancelled: payments.cancelled })
    .from(payments)
    .where(eq(payments.orderId, orderId));
  const paidCents = sumActivePaymentsCents(rows);
  const quotedCents = toCents(order.totalQuoted);
  return {
    quotedCents,
    paidCents,
    balanceCents: quotedCents - paidCents,
    payments: rows.length,
    activePayments: rows.filter((r) => !r.cancelled).length,
  };
}
