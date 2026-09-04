import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, productionEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { stageSchema } from "@/lib/validators";

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

  return NextResponse.json(updated);
}
