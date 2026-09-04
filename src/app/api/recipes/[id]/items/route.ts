import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { bomItems, bomRecipes, materials } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { recipeItemSchema } from "@/lib/validators";

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
  const [material] = await db.select({ id: materials.id }).from(materials).where(eq(materials.id, d.materialId)).limit(1);
  if (!material) return NextResponse.json({ error: "Material no encontrado" }, { status: 400 });
  const [row] = await db.insert(bomItems).values({
    recipeId: id,
    materialId: d.materialId,
    quantity: String(d.quantity),
    wastePercent: String(d.wastePercent),
  }).returning();
  return NextResponse.json(row);
}
