import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { applications, attachments, orderLines, products, techniques } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { applicationInputSchema } from "@/lib/validators";
import { desc, eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [att] = await db.select({ id: attachments.id }).from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!att) return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
  const rows = await db
    .select()
    .from(applications)
    .where(eq(applications.attachmentId, id))
    .orderBy(desc(applications.id));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = applicationInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const [att] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!att) return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });

  // Técnica: debe existir y estar activa.
  let technique: typeof techniques.$inferSelect | undefined;
  if (d.techniqueId) {
    const [t] = await db.select().from(techniques).where(eq(techniques.id, d.techniqueId)).limit(1);
    if (!t) return NextResponse.json({ error: "Técnica no encontrada" }, { status: 400 });
    if (!t.active) return NextResponse.json({ error: "Técnica inactiva" }, { status: 400 });
    technique = t;
  }
  void technique;

  // Línea elegible: explícita, del adjunto, o primera del pedido.
  let lineId: string | null = d.orderLineId ?? att.orderLineId ?? null;
  if (!lineId && att.orderId) {
    const lines = await db.select({ id: orderLines.id }).from(orderLines).where(eq(orderLines.orderId, att.orderId));
    lineId = lines[0]?.id ?? null;
  }
  if (lineId && att.orderId) {
    const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId)).limit(1);
    if (!line || line.orderId !== att.orderId) {
      return NextResponse.json({ error: "Línea inválida para este pedido" }, { status: 400 });
    }
  }

  // Zone validada contra product.zones de la línea (422 si inválida).
  if (lineId) {
    const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId)).limit(1);
    if (line) {
      const [product] = await db.select().from(products).where(eq(products.id, line.productId)).limit(1);
      const zones = product?.zones ?? [];
      if (zones.length > 0 && !zones.includes(d.zone)) {
        return NextResponse.json(
          { error: `Zona inválida para este producto. Zonas válidas: ${zones.join(", ")}` },
          { status: 422 },
        );
      }
    }
  }

  const [row] = await db
    .insert(applications)
    .values({
      attachmentId: id,
      orderLineId: lineId,
      zone: d.zone,
      view: d.view,
      techniqueId: d.techniqueId ?? null,
      widthCm: d.widthCm != null ? String(d.widthCm) : null,
      heightCm: d.heightCm != null ? String(d.heightCm) : null,
      quantity: d.quantity,
      instructions: d.instructions ?? null,
    })
    .returning();
  if (!row) return NextResponse.json({ error: "No se pudo crear la aplicación" }, { status: 500 });
  return NextResponse.json(row, { status: 201 });
}
