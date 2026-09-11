import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { materials, suppliers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { materialBaseSchema } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = materialBaseSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const [current] = await db.select().from(materials).where(eq(materials.id, id)).limit(1);
  if (!current) return NextResponse.json({ error: "Material no encontrado" }, { status: 404 });

  // PATCH is partial: validate the effective row, not only fields present in the body.
  const finalUnit = d.unit ?? current.unit;
  const finalMetersPerKilo = d.metersPerKilo !== undefined
    ? d.metersPerKilo
    : (current.metersPerKilo != null ? Number(current.metersPerKilo) : null);
  if (finalUnit === "kilo" && (finalMetersPerKilo == null || finalMetersPerKilo <= 0)) {
    return NextResponse.json({ error: "Si se compra por kilo, metersPerKilo debe existir y ser mayor que 0" }, { status: 400 });
  }

  const patch: Record<string, string | boolean | null> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.category !== undefined) patch.category = d.category;
  if (d.unit !== undefined) patch.unit = d.unit;
  if (d.unitPrice !== undefined) patch.unitPrice = String(d.unitPrice);
  if (d.supplier !== undefined) patch.supplier = d.supplier ?? null;
  if (d.supplierId !== undefined) {
    if (d.supplierId === null) {
      patch.supplierId = null;
    } else {
      const [sup] = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(eq(suppliers.id, d.supplierId)).limit(1);
      if (!sup) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 400 });
      patch.supplierId = sup.id;
      patch.supplier = sup.name;
    }
  }
  if (d.width !== undefined) patch.width = d.width != null ? String(d.width) : null;
  if (d.gramsPerMeter !== undefined) patch.gramsPerMeter = d.gramsPerMeter != null ? String(d.gramsPerMeter) : null;
  if (d.metersPerKilo !== undefined) patch.metersPerKilo = d.metersPerKilo != null ? String(d.metersPerKilo) : null;
  if (d.yieldPercent !== undefined) patch.yieldPercent = String(d.yieldPercent);
  if (d.notes !== undefined) patch.notes = d.notes ?? null;
  if (body?.active !== undefined) patch.active = body.active !== false;
  const [row] = await db.update(materials).set(patch).where(eq(materials.id, id)).returning();
  return NextResponse.json(row);
}
