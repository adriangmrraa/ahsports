import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { fabrics } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fabricSchema, isUniqueViolation } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = fabricSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const patch: Record<string, string | number | boolean | null> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.sublimable !== undefined) patch.sublimable = d.sublimable;
  if (d.priceModifier !== undefined) patch.priceModifier = String(d.priceModifier);
  if (d.sortOrder !== undefined) patch.sortOrder = d.sortOrder;
  if (body?.active !== undefined) patch.active = body.active !== false;
  try {
    const [row] = await db.update(fabrics).set(patch).where(eq(fabrics.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Tela no encontrada" }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "Ya existe una tela con ese nombre" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error guardando la tela" }, { status: 500 });
  }
}
