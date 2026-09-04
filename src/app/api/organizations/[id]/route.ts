import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { organizationSchema } from "@/lib/validators";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = organizationSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const patch: Record<string, string | null> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.kind !== undefined) patch.kind = d.kind;
  if (d.taxId !== undefined) patch.taxId = d.taxId ?? null;
  if (d.notes !== undefined) patch.notes = d.notes ?? null;
  const [row] = await db.update(organizations).set(patch).where(eq(organizations.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
  return NextResponse.json(row);
}
