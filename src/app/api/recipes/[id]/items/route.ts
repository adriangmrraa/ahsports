import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { bomItems, bomRecipes, materials } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { recipeItemSchema } from "@/lib/validators";
import { calculateBomConsumption } from "@/lib/consumption";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [recipe] = await db.select({ id: bomRecipes.id }).from(bomRecipes).where(eq(bomRecipes.id, id)).limit(1);
  if (!recipe) return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const parsed = recipeItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const [material] = await db.select().from(materials).where(eq(materials.id, d.materialId)).limit(1);
  if (!material) return NextResponse.json({ error: "Material no encontrado" }, { status: 400 });
  if (material.unit === "kilo" && (!material.metersPerKilo || Number(material.metersPerKilo) <= 0)) {
    return NextResponse.json({ error: `El material "${material.name}" se compra por kilo y necesita metros/kilo para poder consumirse en una receta.` }, { status: 400 });
  }
  let calculated;
  try {
    calculated = calculateBomConsumption({
      mode: d.consumptionMode,
      directQuantity: d.directQuantity,
      unitsPerConsumptionUnit: d.unitsPerConsumptionUnit,
      legacyQuantity: d.quantity,
      wastePercent: d.wastePercent,
      materialName: material.name,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Consumo inválido" }, { status: 400 });
  }
  const [row] = await db.insert(bomItems).values({
    recipeId: id,
    materialId: d.materialId,
    consumptionMode: calculated.mode,
    quantity: String(calculated.baseQuantityPerUnit),
    directQuantity: calculated.directQuantity == null ? null : String(calculated.directQuantity),
    unitsPerConsumptionUnit: calculated.unitsPerConsumptionUnit == null ? null : String(calculated.unitsPerConsumptionUnit),
    wastePercent: String(d.wastePercent),
  }).returning();
  return NextResponse.json(row);
}
