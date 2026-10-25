import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { fabrics, productFabrics, products, productTechniques, productVolumeTiers, techniques } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { productOptionsSchema } from "@/lib/validators";

/**
 * PUT /api/products/[id]/options — full-replace of the product's option
 * matrix: allowed fabrics, allowed methods and the volume discount ladder.
 * Same replace-set pattern as /api/products/[id]/sizes.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = productOptionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const fabricIds = d.fabrics.map((f) => f.fabricId);
  if (fabricIds.length > 0) {
    const found = await db.select({ id: fabrics.id }).from(fabrics).where(inArray(fabrics.id, fabricIds));
    if (found.length !== new Set(fabricIds).size) {
      return NextResponse.json({ error: "Una o más telas no existen" }, { status: 400 });
    }
  }
  const techniqueIds = d.techniques.map((t) => t.techniqueId);
  if (techniqueIds.length > 0) {
    const found = await db.select({ id: techniques.id }).from(techniques).where(inArray(techniques.id, techniqueIds));
    if (found.length !== new Set(techniqueIds).size) {
      return NextResponse.json({ error: "Uno o más métodos no existen" }, { status: 400 });
    }
  }

  // Neon HTTP: sin tx — delete + reinsert secuencial por colección.
  await db.delete(productFabrics).where(eq(productFabrics.productId, id));
  if (d.fabrics.length > 0) {
    await db.insert(productFabrics).values(
      d.fabrics.map((f) => ({ productId: id, fabricId: f.fabricId, priceModifier: String(f.priceModifier) })),
    );
  }
  await db.delete(productTechniques).where(eq(productTechniques.productId, id));
  if (d.techniques.length > 0) {
    await db.insert(productTechniques).values(
      d.techniques.map((t) => ({ productId: id, techniqueId: t.techniqueId, priceModifier: String(t.priceModifier) })),
    );
  }
  await db.delete(productVolumeTiers).where(eq(productVolumeTiers.productId, id));
  if (d.volumeTiers.length > 0) {
    await db.insert(productVolumeTiers).values(
      d.volumeTiers.map((t) => ({ productId: id, minQty: t.minQty, discountPercent: String(t.discountPercent) })),
    );
  }

  return NextResponse.json({ ok: true });
}
