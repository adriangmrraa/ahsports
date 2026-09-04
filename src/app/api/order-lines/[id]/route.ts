import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orderLines } from "@/db/schema";
import { requireUser } from "@/lib/auth";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [line] = await db.select().from(orderLines).where(eq(orderLines.id, id)).limit(1);
  if (!line) return NextResponse.json({ error: "Línea no encontrada" }, { status: 404 });
  // Cascade a orderItems por FK onDelete cascade.
  await db.delete(orderLines).where(eq(orderLines.id, id));
  return NextResponse.json({ ok: true });
}
