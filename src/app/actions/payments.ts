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
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof PaymentDomainError) return { ok: false as const, error: error.message };
    return { ok: false as const, error: "No se pudo registrar el pago" };
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
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof PaymentDomainError) return { ok: false as const, error: error.message };
    return { ok: false as const, error: "No se pudo cancelar el pago" };
  }
}
