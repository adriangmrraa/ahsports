import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { bomItems, materials } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { recipeItemSchema } from "@/lib/validators";
import { calculateBomConsumption } from "@/lib/consumption";

async function parseItem(body: unknown) {
  const parsed = recipeItemSchema.safeParse(body);
  if (!parsed.success) return { error: { error: "Datos inválidos", issues: parsed.error.flatten() } } as const;
  const material = (await db.select().from(materials).where(eq(materials.id, parsed.data.materialId)).limit(1))[0];
  if (!material) return { error: { error: "Material no encontrado" } } as const;
  if (material.unit === "kilo" && (!material.metersPerKilo || Number(material.metersPerKilo) <= 0)) {
    return { error: { error: `El material "${material.name}" se compra por kilo y necesita metros/kilo para poder consumirse en una receta.` } } as const;
  }
  try {
    return {
      data: parsed.data,
      calculated: calculateBomConsumption({
        mode: parsed.data.consumptionMode,
        directQuantity: parsed.data.directQuantity,
        unitsPerConsumptionUnit: parsed.data.unitsPerConsumptionUnit,
        legacyQuantity: parsed.data.quantity,
        wastePercent: parsed.data.wastePercent,
        materialName: material.name,
      }),
    } as const;
  } catch (error) {
    return { error: { error: error instanceof Error ? error.message : "Consumo inválido" } } as const;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  await requireUser();
  const { itemId } = await params;
  const [item] = await db.select({ id: bomItems.id }).from(bomItems).where(eq(bomItems.id, itemId)).limit(1);
  if (!item) return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
  const parsed = await parseItem(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json(parsed.error, { status: 400 });
  const { data, calculated } = parsed;
  const [row] = await db.update(bomItems).set({
    materialId: data.materialId,
    consumptionMode: calculated.mode,
    quantity: String(calculated.baseQuantityPerUnit),
    directQuantity: calculated.directQuantity == null ? null : String(calculated.directQuantity),
    unitsPerConsumptionUnit: calculated.unitsPerConsumptionUnit == null ? null : String(calculated.unitsPerConsumptionUnit),
    wastePercent: String(data.wastePercent),
  }).where(eq(bomItems.id, itemId)).returning();
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  await requireUser();
  const { itemId } = await params;
  const deleted = await db.delete(bomItems).where(eq(bomItems.id, itemId)).returning({ id: bomItems.id });
  if (deleted.length === 0) return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
