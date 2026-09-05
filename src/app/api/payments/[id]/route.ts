import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { withDbTransaction } from "@/lib/db-transaction";
import { PaymentDomainError, cancelPaymentTx } from "@/lib/payments";

/** F5-06 — Cancelar pago (soft-delete). Recalcula el bloqueo del pedido. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  try {
    const result = await withDbTransaction((tx) => cancelPaymentTx(tx, id, user.id));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PaymentDomainError) {
      const status = error.message === "Pago no encontrado" ? 404 : 422;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "No se pudo cancelar el pago" }, { status: 500 });
  }
}
