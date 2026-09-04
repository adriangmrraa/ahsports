import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { materials } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { materialSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = materialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const [row] = await db.insert(materials).values({
    name: d.name,
    category: d.category,
    unit: d.unit,
    unitPrice: String(d.unitPrice),
    supplier: d.supplier ?? null,
    width: d.width != null ? String(d.width) : null,
    gramsPerMeter: d.gramsPerMeter != null ? String(d.gramsPerMeter) : null,
    metersPerKilo: d.metersPerKilo != null ? String(d.metersPerKilo) : null,
    yieldPercent: String(d.yieldPercent),
    notes: d.notes ?? null,
  }).returning();
  return NextResponse.json(row);
}
