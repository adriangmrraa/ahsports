import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, productionEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { stageSchema } from "@/lib/validators";
import { notifyOrderStatusChange } from "@/lib/whatsapp/order-status-notify";

const PRODUCTIVE = ["en_produccion", "corte", "confeccion", "estampado", "control", "entregado"] as const;

// productionEvents.stage usa el enum productionStage (ingreso→entrega):
// se mapea la etapa del pedido para auditar sin romper el FK del enum.
const STAGE_TO_EVENT: Record<string, "ingreso" | "corte" | "confeccion" | "estampado" | "control" | "entrega"> = {
  en_produccion: "ingreso",
  corte: "corte",
  confeccion: "confeccion",
  estampado: "estampado",
  control: "control",
  entregado: "entrega",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = stageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Stage inválido", issues: parsed.error.flatten() }, { status: 400 });
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  // Bloqueo por seña: estado bloqueado_pago no avanza a etapa productiva.
  if (order.status === "bloqueado_pago" && (PRODUCTIVE as readonly string[]).includes(parsed.data.stage)) {
    return NextResponse.json({ error: "Pedido bloqueado por seña insuficiente" }, { status: 409 });
  }

  // No-op transition: nothing changed, so no audit row and — critically —
  // no customer notification (a repeated POST must never re-notify).
  if (order.status === parsed.data.stage) {
    return NextResponse.json(order);
  }

  // Neon HTTP: sin tx — update + audit secuenciales.
  const [updated] = await db
    .update(orders)
    .set({ status: parsed.data.stage, updatedAt: new Date() })
    .where(eq(orders.id, id))
    .returning();
  await db.insert(productionEvents).values({
    orderId: id,
    stage: STAGE_TO_EVENT[parsed.data.stage],
    note: `order:${parsed.data.stage}`,
    userId: user.id,
  });

  // Customer notification is best-effort: the stage change already committed,
  // and an unreachable customer must never fail the admin operation.
  try {
    const notified = await notifyOrderStatusChange(id, parsed.data.stage);
    if (!notified.ok) {
      console.warn(
        `[orders/stage] customer notification not sent for order ${id.slice(0, 8)}… (${notified.error})`,
      );
    }
  } catch {
    console.warn(`[orders/stage] customer notification failed for order ${id.slice(0, 8)}…`);
  }

  return NextResponse.json(updated);
}
