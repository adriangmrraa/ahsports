import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { techniques } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { techniqueSchema } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = techniqueSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const patch: Record<string, string | boolean | null> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.costPerUnit !== undefined) patch.costPerUnit = String(d.costPerUnit);
  if (d.costPerSquareMeter !== undefined) patch.costPerSquareMeter = String(d.costPerSquareMeter);
  if (d.setupCost !== undefined) patch.setupCost = String(d.setupCost);
  if (d.description !== undefined) patch.description = d.description ?? null;
  if (body?.active !== undefined) patch.active = body.active !== false;
  const [row] = await db.update(techniques).set(patch).where(eq(techniques.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Técnica no encontrada" }, { status: 404 });
  return NextResponse.json(row);
}
