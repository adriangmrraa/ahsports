import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { bomRecipes, garmentMolds, orderItems, products, sizes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { eq, inArray } from "drizzle-orm";
import { sizesBatchSchema } from "@/lib/validators";
import { defaultMeasurementSchema, validateGarmentMeasurementKeys } from "@/lib/garments";

const emptyMeasurementSchema = { required: [], optional: [] };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const parsed = sizesBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const measurementSchema = product.moldId
    ? (await db.select({ measurementSchema: garmentMolds.measurementSchema }).from(garmentMolds).where(eq(garmentMolds.id, product.moldId)).limit(1))[0]?.measurementSchema
    : product.garmentFamily ? defaultMeasurementSchema(product.garmentFamily) : emptyMeasurementSchema;
  for (const size of parsed.data.sizes) {
    const invalid = validateGarmentMeasurementKeys(size.measurements, measurementSchema ?? (product.garmentFamily ? defaultMeasurementSchema(product.garmentFamily) : emptyMeasurementSchema));
    if (invalid.missing.length > 0 || invalid.unknown.length > 0) {
      const details = [invalid.missing.length > 0 ? `faltan: ${invalid.missing.join(", ")}` : "", invalid.unknown.length > 0 ? `no permitidas: ${invalid.unknown.join(", ")}` : ""].filter(Boolean).join("; ");
      return NextResponse.json({ error: `Las medidas del talle ${size.label} no cumplen el esquema configurado (${details}).` }, { status: 400 });
    }
  }

  const existing = await db.select().from(sizes).where(eq(sizes.productId, id));
  const existingIds = new Set(existing.map((size) => size.id));
  const submittedIds = new Set<string>();

  for (const size of parsed.data.sizes) {
    if (!size.id) continue;
    if (existingIds.has(size.id)) {
      submittedIds.add(size.id);
      continue;
    }
    if (!size.id.startsWith("new-")) {
      return NextResponse.json({ error: "El talle no pertenece a este producto" }, { status: 400 });
    }
  }

  const removedIds = existing.filter((size) => !submittedIds.has(size.id)).map((size) => size.id);
  if (removedIds.length > 0) {
    const [recipeReference] = await db
      .select({ sizeId: bomRecipes.sizeId })
      .from(bomRecipes)
      .where(inArray(bomRecipes.sizeId, removedIds))
      .limit(1);
    const [orderReference] = await db
      .select({ sizeId: orderItems.sizeId })
      .from(orderItems)
      .where(inArray(orderItems.sizeId, removedIds))
      .limit(1);
    if (recipeReference || orderReference) {
      return NextResponse.json(
        { error: "No se puede quitar un talle con recetas o prendas históricas asociadas. Conservá el talle o eliminá esas referencias explícitamente primero." },
        { status: 409 },
      );
    }
  }

  for (const size of parsed.data.sizes) {
    if (size.id && existingIds.has(size.id)) {
      await db.update(sizes).set({ label: size.label, order: size.order, measurements: size.measurements }).where(eq(sizes.id, size.id));
    }
  }
  const newSizes = parsed.data.sizes.filter((size) => !size.id || !existingIds.has(size.id));
  if (newSizes.length > 0) {
    await db.insert(sizes).values(newSizes.map((size) => ({
      productId: id,
      label: size.label,
      order: size.order,
      measurements: size.measurements,
    })));
  }
  if (removedIds.length > 0) {
    await db.delete(sizes).where(inArray(sizes.id, removedIds));
  }
  return NextResponse.json({ ok: true });
}
