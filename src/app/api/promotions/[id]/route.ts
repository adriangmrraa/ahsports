import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { products, promotions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { promotionSchema } from "@/lib/validators";

/** GET /api/promotions/[id] — admin read (includes inactive rows). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [row] = await db.select().from(promotions).where(eq(promotions.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Promoción no encontrada" }, { status: 404 });
  return NextResponse.json(row);
}

/** PATCH — admin update; re-validates item productIds against the catalog. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = promotionSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (d.name !== undefined) patch.name = d.name;
  if (d.description !== undefined) patch.description = d.description ?? null;
  if (d.imageUrl !== undefined) patch.imageUrl = d.imageUrl ?? null;
  if (d.customPrice !== undefined) patch.customPrice = d.customPrice != null ? String(d.customPrice) : null;
  if (d.active !== undefined) patch.active = d.active;
  if (d.items !== undefined) {
    const productIds = d.items.map((item) => item.productId);
    const found = productIds.length
      ? await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, productIds))
      : [];
    const nameById = new Map(found.map((row) => [row.id, row.name]));
    const missing = productIds.filter((pid) => !nameById.has(pid));
    if (missing.length > 0) {
      return NextResponse.json({ error: `Productos inexistentes: ${missing.length}` }, { status: 400 });
    }
    patch.items = d.items.map((item) => ({
      productId: item.productId,
      productName: nameById.get(item.productId) ?? "",
      quantity: item.quantity,
    }));
  }

  const [row] = await db.update(promotions).set(patch).where(eq(promotions.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Promoción no encontrada" }, { status: 404 });
  return NextResponse.json(row);
}

/** DELETE — admin hard delete (promos are marketing content, not financial facts). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [row] = await db.delete(promotions).where(eq(promotions.id, id)).returning({ id: promotions.id });
  if (!row) return NextResponse.json({ error: "Promoción no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
