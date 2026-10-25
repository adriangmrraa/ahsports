import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { orderItems, orderLines, orderLineTechniques, orders, products, sizes, techniques } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { assertLineOptionsAllowed, getProductMethodDeltas, normalizeTechniqueIds } from "@/lib/product-options-store";
import { z } from "zod";

const bodySchema = z.object({
  productId: z.string().min(1).max(36),
  techniqueId: z.string().max(36).optional().nullable(),
  /** Stackable methods — the full selection; techniqueId stays as primary. */
  techniqueIds: z.array(z.string().max(36)).max(20).optional(),
  fabricId: z.string().max(36).optional().nullable(),
  notes: z.string().optional().nullable(),
  sizeQuantities: z.record(z.string(), z.number().int().min(0).max(1000)).default({}),
  quantity: z.number().int().min(1).max(10000).optional().nullable(),
}).strict();

const EDITABLE = ["borrador", "presupuesto_enviado", "aprobado"] as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  if (!(EDITABLE as readonly string[]).includes(order.status)) {
    return NextResponse.json({ error: `Pedido en estado ${order.status}, no admite líneas` }, { status: 409 });
  }

  const [product] = await db.select().from(products).where(eq(products.id, d.productId)).limit(1);
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  if (!product.active) return NextResponse.json({ error: "Producto inactivo" }, { status: 409 });
  const techniqueIds = normalizeTechniqueIds(d.techniqueIds, d.techniqueId);
  if (techniqueIds.length > 0) {
    const found = await db.select({ id: techniques.id }).from(techniques).where(inArray(techniques.id, techniqueIds));
    if (found.length !== techniqueIds.length) {
      return NextResponse.json({ error: "Técnica no encontrada" }, { status: 404 });
    }
  }
  const optionsError = await assertLineOptionsAllowed({
    productId: product.id,
    productName: product.name,
    fabricId: d.fabricId ?? null,
    techniqueIds,
  });
  if (optionsError) return NextResponse.json({ error: optionsError }, { status: 400 });
  const productSizes = await db.select().from(sizes).where(eq(sizes.productId, d.productId));
  const sizeIds = new Set(productSizes.map((s) => s.id));
  const entries = Object.entries(d.sizeQuantities ?? {}).filter(([, q]) => q > 0);
  for (const [sizeId] of entries) {
    if (!sizeIds.has(sizeId)) {
      return NextResponse.json({ error: "Talle inválido para este producto" }, { status: 400 });
    }
  }
  const totalQty = entries.length > 0 ? entries.reduce((acc, [, q]) => acc + q, 0) : (d.quantity ?? 0);
  if (totalQty <= 0) return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 });

  // Neon HTTP: sin tx — writes secuenciales línea → métodos → items.
  const [line] = await db
    .insert(orderLines)
    .values({
      orderId: id,
      productId: d.productId,
      techniqueId: techniqueIds[0] ?? null,
      fabricId: d.fabricId ?? null,
      quantity: totalQty,
      unitPrice: String(product.basePrice),
      unitCost: "0",
      notes: d.notes ?? null,
    })
    .returning();
  if (!line) return NextResponse.json({ error: "No se pudo crear la línea" }, { status: 500 });

  // Full stackable selection with the sell delta applied at creation time.
  const methodDeltas = await getProductMethodDeltas(d.productId, techniqueIds);
  for (const techniqueId of techniqueIds) {
    await db.insert(orderLineTechniques).values({
      orderLineId: line.id,
      techniqueId,
      priceModifier: String(methodDeltas.get(techniqueId) ?? 0),
    });
  }

  let created = 0;
  if (entries.length > 0) {
    for (const [sizeId, qty] of entries) {
      for (let i = 0; i < qty; i++) {
        await db.insert(orderItems).values({ orderLineId: line.id, sizeId });
        created++;
      }
    }
  } else {
    for (let i = 0; i < totalQty; i++) {
      await db.insert(orderItems).values({ orderLineId: line.id, sizeId: null });
      created++;
    }
  }

  return NextResponse.json({ ...line, itemCount: created }, { status: 201 });
}
