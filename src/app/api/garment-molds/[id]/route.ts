import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { garmentMolds } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { garmentMoldPatchSchema } from "@/lib/validators";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const parsed = garmentMoldPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.family !== undefined) patch.family = d.family;
  if (d.notes !== undefined) patch.notes = d.notes ?? null;
  if (d.requiredMeasurements !== undefined || d.optionalMeasurements !== undefined) {
    const [current] = await db.select().from(garmentMolds).where(eq(garmentMolds.id, id)).limit(1);
    if (!current) return NextResponse.json({ error: "Molde no encontrado" }, { status: 404 });
    patch.measurementSchema = {
      required: d.requiredMeasurements ?? current.measurementSchema.required,
      optional: d.optionalMeasurements ?? current.measurementSchema.optional,
    };
  }
  const [row] = await db.update(garmentMolds).set(patch).where(eq(garmentMolds.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Molde no encontrado" }, { status: 404 });
  return NextResponse.json(row);
}
