import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { productTaxonomyNodes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/validators";

const patchSchema = z.object({
  label: z.string().trim().min(1).max(255).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
}).strict();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  try {
    const [row] = await db.update(productTaxonomyNodes).set(parsed.data).where(eq(productTaxonomyNodes.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Opción no encontrada" }, { status: 404 });
    return NextResponse.json(row);
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: "Ya existe ese valor en el mismo nivel." }, { status: 409 });
    return NextResponse.json({ error: "No se pudo actualizar la opción." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [row] = await db.update(productTaxonomyNodes).set({ active: false }).where(eq(productTaxonomyNodes.id, id)).returning({ id: productTaxonomyNodes.id });
  if (!row) return NextResponse.json({ error: "Opción no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
