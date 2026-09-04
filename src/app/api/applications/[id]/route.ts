import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { applications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [row] = await db.select({ id: applications.id }).from(applications).where(eq(applications.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Aplicación no encontrada" }, { status: 404 });
  await db.delete(applications).where(eq(applications.id, id));
  return NextResponse.json({ ok: true });
}
