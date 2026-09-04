import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orderItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { orderItemPatchSchema } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = orderItemPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const [item] = await db.select().from(orderItems).where(eq(orderItems.id, id)).limit(1);
  if (!item) return NextResponse.json({ error: "Prenda no encontrada" }, { status: 404 });

  const patch: Partial<typeof orderItems.$inferInsert> = {};
  if (parsed.data.individualName !== undefined) patch.individualName = parsed.data.individualName || null;
  if (parsed.data.individualNumber !== undefined) patch.individualNumber = parsed.data.individualNumber || null;
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;

  const [updated] = await db.update(orderItems).set(patch).where(eq(orderItems.id, id)).returning();
  return NextResponse.json(updated);
}
