import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { materials, suppliers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { materialSchema } from "@/lib/validators";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = materialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  // F6 — supplier canónico: si viene supplierId se valida y se denormaliza el nombre.
  let supplierName: string | null = d.supplier ?? null;
  if (d.supplierId) {
    const [sup] = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(eq(suppliers.id, d.supplierId)).limit(1);
    if (!sup) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 400 });
    supplierName = sup.name;
  }
  const [row] = await db.insert(materials).values({
    name: d.name,
    category: d.category,
    unit: d.unit,
    unitPrice: String(d.unitPrice),
    supplier: supplierName,
    supplierId: d.supplierId ?? null,
    width: d.width != null ? String(d.width) : null,
    gramsPerMeter: d.gramsPerMeter != null ? String(d.gramsPerMeter) : null,
    metersPerKilo: d.metersPerKilo != null ? String(d.metersPerKilo) : null,
    yieldPercent: String(d.yieldPercent),
    notes: d.notes ?? null,
  }).returning();
  return NextResponse.json(row);
}
