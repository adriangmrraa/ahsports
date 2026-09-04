import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orderItems, orderLines, productionEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { orderItemStageSchema } from "@/lib/validators";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = orderItemStageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }

  const [item] = await db.select().from(orderItems).where(eq(orderItems.id, id)).limit(1);
  if (!item) return NextResponse.json({ error: "Prenda no encontrada" }, { status: 404 });
  const [line] = await db.select().from(orderLines).where(eq(orderLines.id, item.orderLineId)).limit(1);
  if (!line) return NextResponse.json({ error: "Línea no encontrada" }, { status: 404 });

  // Neon HTTP: sin tx — update + audit secuenciales.
  const [updated] = await db.update(orderItems).set({ status: parsed.data.stage }).where(eq(orderItems.id, id)).returning();
  await db.insert(productionEvents).values({
    orderId: line.orderId,
    orderItemId: id,
    stage: parsed.data.stage,
    userId: user.id,
  });

  return NextResponse.json(updated);
}
