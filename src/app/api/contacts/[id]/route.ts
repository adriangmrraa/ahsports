import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { contacts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { contactSchema } from "@/lib/validators";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = contactSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const patch: Record<string, string | null> = {};
  if (d.organizationId !== undefined) patch.organizationId = d.organizationId ?? null;
  if (d.name !== undefined) patch.name = d.name;
  if (d.email !== undefined) patch.email = d.email ?? null;
  if (d.phone !== undefined) patch.phone = d.phone ?? null;
  if (d.role !== undefined) patch.role = d.role ?? null;
  if (d.notes !== undefined) patch.notes = d.notes ?? null;
  if (d.status !== undefined) patch.status = d.status;
  const [row] = await db.update(contacts).set(patch).where(eq(contacts.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
  return NextResponse.json(row);
}
