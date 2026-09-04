import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { pricingRules } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { eq, ne } from "drizzle-orm";
import { pricingRuleSchema } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = pricingRuleSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const patch: Record<string, string | boolean> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.marginPercent !== undefined) patch.marginPercent = String(d.marginPercent);
  if (d.urgentSurcharge !== undefined) patch.urgentSurcharge = String(d.urgentSurcharge);
  if (d.minAdvancePercent !== undefined) patch.minAdvancePercent = String(d.minAdvancePercent);
  if (d.rounding !== undefined) patch.rounding = String(d.rounding);
  if (d.active !== undefined) patch.active = d.active;
  if (patch.active === true) {
    // NOTA: el driver Neon HTTP no soporta transacciones; se desactiva el resto
    // con un update secuencial previo para que solo UNA regla quede con
    // active=true. Hay una ventana mínima de carrera entre ambos updates.
    await db.update(pricingRules).set({ active: false }).where(ne(pricingRules.id, id));
  }
  const [row] = await db.update(pricingRules).set(patch).where(eq(pricingRules.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Regla de precio no encontrada" }, { status: 404 });
  return NextResponse.json(row);
}
