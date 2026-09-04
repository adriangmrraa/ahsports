import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { bomItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  await requireUser();
  const { itemId } = await params;
  const deleted = await db.delete(bomItems).where(eq(bomItems.id, itemId)).returning({ id: bomItems.id });
  if (deleted.length === 0) return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
