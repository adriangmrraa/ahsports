import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { pricingRules } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { pricingRuleSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = pricingRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  // NOTA: el driver Neon HTTP no soporta transacciones; si la nueva regla nace
  // activa se desactiva el resto con un update secuencial previo para que solo
  // UNA regla quede con active=true.
  if (d.active) {
    await db.update(pricingRules).set({ active: false });
  }
  const [row] = await db.insert(pricingRules).values({
    name: d.name,
    marginPercent: String(d.marginPercent),
    urgentSurcharge: String(d.urgentSurcharge),
    minAdvancePercent: String(d.minAdvancePercent),
    rounding: String(d.rounding),
    active: d.active,
  }).returning();
  return NextResponse.json(row);
}
