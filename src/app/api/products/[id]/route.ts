import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { productBundleItems, productBundles, products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { productPatchSchema, isUniqueViolation } from "@/lib/validators";
import { replaceBundleItems, validateProductClassification, validateProductStructure } from "@/lib/product-domain";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = productPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const [current] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!current) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  const finalKind = d.productKind ?? current.productKind;
  const finalFamily = d.garmentFamily !== undefined ? d.garmentFamily : current.garmentFamily;
  const finalMoldId = d.moldId !== undefined ? d.moldId : current.moldId;
  let finalItems = d.bundleItems;
  if (finalItems === undefined && finalKind === "bundle") {
    const [bundle] = await db.select({ id: productBundles.id }).from(productBundles).where(eq(productBundles.productId, id)).limit(1);
    const existingItems = bundle ? await db.select().from(productBundleItems).where(eq(productBundleItems.bundleId, bundle.id)) : [];
    finalItems = existingItems.map((item) => ({
      componentProductId: item.componentProductId,
      quantity: Number(item.quantity),
      sizeMode: item.sizeMode,
      componentSizeId: item.componentSizeId,
    }));
  }
  const finalCategory = d.productCategory ?? current.productCategory;
  const finalSubcategory = d.productSubcategory ?? current.productSubcategory;
  const finalType = d.productType ?? current.productType;
  const classificationError = await validateProductClassification(finalCategory, finalSubcategory, finalType);
  if (classificationError) return NextResponse.json({ error: classificationError }, { status: 400 });
  const structureError = await validateProductStructure({ productKind: finalKind, garmentFamily: finalFamily, moldId: finalMoldId, bundleItems: finalItems }, id);
  if (structureError) return NextResponse.json({ error: structureError }, { status: 400 });
  const patch: Record<string, string | number | boolean | string[] | null> = {};
  if (d.sku !== undefined) patch.sku = d.sku;
  if (d.name !== undefined) patch.name = d.name;
  if (d.description !== undefined) patch.description = d.description ?? null;
  if (d.category !== undefined) patch.category = d.category ?? null;
  if (d.productKind !== undefined) patch.productKind = d.productKind;
  if (d.productCategory !== undefined) patch.productCategory = d.productCategory;
  if (d.productSubcategory !== undefined) patch.productSubcategory = d.productSubcategory;
  if (d.productType !== undefined) patch.productType = d.productType;
  if (d.garmentFamily !== undefined) patch.garmentFamily = d.garmentFamily;
  if (d.garmentType !== undefined) patch.garmentType = d.garmentType;
  if (d.moldId !== undefined) patch.moldId = d.moldId ?? null;
  if (d.basePrice !== undefined) patch.basePrice = String(d.basePrice);
  if (d.minOrder !== undefined) patch.minOrder = d.minOrder;
  if (d.zones !== undefined) patch.zones = d.zones;
  if (body?.active !== undefined) patch.active = body.active !== false;
  try {
    const [row] = await db.update(products).set(patch).where(eq(products.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    if (d.bundleItems !== undefined || d.productKind !== undefined) {
      await replaceBundleItems(id, finalKind === "bundle" ? finalItems : []);
    }
    return NextResponse.json(row);
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "SKU duplicado" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error guardando producto" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  await db.update(products).set({ active: false }).where(eq(products.id, id));
  return NextResponse.json({ ok: true });
}
