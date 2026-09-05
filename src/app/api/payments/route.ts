import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { withDbTransaction } from "@/lib/db-transaction";
import { PaymentDomainError, registerPaymentTx } from "@/lib/payments";
import { registerPaymentSchema } from "@/lib/validators";

/** F5-05 — Crear pago con recálculo de bloqueo (misma lógica que la action). */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = registerPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos del pago inválidos", issues: parsed.error.flatten() }, { status: 400 });
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
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof PaymentDomainError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json({ error: "No se pudo registrar el pago" }, { status: 500 });
  }
}
