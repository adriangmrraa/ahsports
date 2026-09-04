import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { bomRecipes, products, sizes, techniques } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { recipeSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = recipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, d.productId)).limit(1);
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  if (d.sizeId) {
    const [size] = await db.select({ id: sizes.id }).from(sizes).where(eq(sizes.id, d.sizeId)).limit(1);
    if (!size) return NextResponse.json({ error: "Talle no encontrado" }, { status: 400 });
  }
  if (d.techniqueId) {
    const [tech] = await db.select({ id: techniques.id }).from(techniques).where(eq(techniques.id, d.techniqueId)).limit(1);
    if (!tech) return NextResponse.json({ error: "Técnica no encontrada" }, { status: 400 });
  }
  const [row] = await db.insert(bomRecipes).values({
    productId: d.productId,
    sizeId: d.sizeId ?? null,
    techniqueId: d.techniqueId ?? null,
    notes: d.notes ?? null,
  }).returning();
  return NextResponse.json(row);
}
