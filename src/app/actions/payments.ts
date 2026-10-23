"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { withDbTransaction } from "@/lib/db-transaction";
import { PaymentDomainError, cancelPaymentTx, registerPaymentTx } from "@/lib/payments";
import { cancelPaymentSchema, registerPaymentSchema } from "@/lib/validators";

/**
 * F5-04 — Registra un pago con recálculo de bloqueo atómico.
 * Solo usuarios autenticados (el gate de roles finos se confirma en 5.2).
 */
export async function registerPayment(input: unknown) {
  const user = await requireUser();
  const parsed = registerPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos del pago inválidos", issues: parsed.error.flatten() };
  }
  const d = parsed.data;
  try {
    const result = await withDbTransaction((tx) =>
      registerPaymentTx(tx, {
        orderId: d.orderId,
        kind: d.kind,
        method: d.method,
        amount: d.amount,
        reference: d.reference ?? null,
        notes: d.notes ?? null,
        createdById: user.id,
      }),
    );
    revalidatePath(`/admin/pedidos/${d.orderId}`);
    revalidatePath(`/admin/pedidos/${d.orderId}/pagos`);
    revalidatePath("/admin/pagos");
    revalidatePath("/admin/caja");
    // A-04: the payment gate may have moved the order to aprobado. Best-effort.
    if (result.statusChanged) {
      await notifyStatusQuietly(d.orderId, result.status);
    }
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof PaymentDomainError) return { ok: false as const, error: error.message };
    return { ok: false as const, error: "No se pudo registrar el pago" };
  }
}

/**
 * A-04 best-effort customer notification after a payment-driven status change.
 * The financial write already committed; never surface a send failure to the
 * caller (the status itself is what the UI must report).
 */
async function notifyStatusQuietly(orderId: string, status: string): Promise<void> {
  try {
    const { notifyOrderStatusChange } = await import("@/lib/whatsapp/order-status-notify");
    const notified = await notifyOrderStatusChange(orderId, status);
    if (!notified.ok) {
      console.warn(
        `[payments] customer notification not sent for order ${orderId.slice(0, 8)}… (${notified.error})`,
      );
    }
  } catch {
    console.warn(`[payments] customer notification failed for order ${orderId.slice(0, 8)}…`);
  }
}

/** F5-06 — Cancela un pago (soft) con recálculo de bloqueo atómico. */
export async function cancelPayment(input: unknown) {
  const user = await requireUser();
  const parsed = cancelPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }
  try {
    const result = await withDbTransaction((tx) => cancelPaymentTx(tx, parsed.data.paymentId, user.id));
    revalidatePath(`/admin/pedidos/${result.orderId}`);
    revalidatePath(`/admin/pedidos/${result.orderId}/pagos`);
    revalidatePath("/admin/pagos");
    revalidatePath("/admin/caja");
    // A-04: cancelling a payment may re-block the order (bloqueado_pago).
    if (result.statusChanged) {
      await notifyStatusQuietly(result.orderId, result.status);
    }
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof PaymentDomainError) return { ok: false as const, error: error.message };
    return { ok: false as const, error: "No se pudo cancelar el pago" };
  }
}
