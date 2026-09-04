import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { applications, attachments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { activeStorage } from "@/lib/storage";
import { attachmentPatchSchema } from "@/lib/validators";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [row] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = attachmentPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const [current] = await db.select({ id: attachments.id }).from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!current) return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });

  const patch: Partial<typeof attachments.$inferInsert> = {};
  if (d.status !== undefined) patch.status = d.status;
  if (d.notes !== undefined) patch.notes = d.notes ?? null;
  if (d.name !== undefined) patch.name = d.name;
  const [row] = await db.update(attachments).set(patch).where(eq(attachments.id, id)).returning();
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [row] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });

  const apps = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.attachmentId, id))
    .limit(1);
  if (apps.length > 0) {
    return NextResponse.json(
      { error: "No se puede eliminar: el adjunto tiene aplicaciones asociadas" },
      { status: 409 },
    );
  }

  try {
    await activeStorage.delete(row.url);
  } catch {
    // El row se borra igual; el archivo huérfano se limpia manual.
  }
  await db.delete(attachments).where(eq(attachments.id, id));
  return NextResponse.json({ ok: true });
}
