import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { suppliers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { isUniqueViolation, supplierSchema } from "@/lib/validators";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = supplierSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const patch: Record<string, string | boolean | null> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.phone !== undefined) patch.phone = d.phone ?? null;
  if (d.email !== undefined) patch.email = d.email ?? null;
  if (d.address !== undefined) patch.address = d.address ?? null;
  if (d.contactName !== undefined) patch.contactName = d.contactName ?? null;
  if (d.taxId !== undefined) patch.taxId = d.taxId ?? null;
  if (d.notes !== undefined) patch.notes = d.notes ?? null;
  if (body?.active !== undefined) patch.active = body.active !== false;
  try {
    const [row] = await db.update(suppliers).set(patch).where(eq(suppliers.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
    return NextResponse.json(row);
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: "Ya existe un proveedor con ese nombre" }, { status: 409 });
    throw error;
  }
}
