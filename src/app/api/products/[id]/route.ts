import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { productSchema, isUniqueViolation } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = productSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const patch: Record<string, string | number | boolean | string[] | null> = {};
  if (d.sku !== undefined) patch.sku = d.sku;
  if (d.name !== undefined) patch.name = d.name;
  if (d.description !== undefined) patch.description = d.description ?? null;
  if (d.category !== undefined) patch.category = d.category ?? null;
  if (d.basePrice !== undefined) patch.basePrice = String(d.basePrice);
  if (d.minOrder !== undefined) patch.minOrder = d.minOrder;
  if (d.zones !== undefined) patch.zones = d.zones;
  if (body?.active !== undefined) patch.active = body.active !== false;
  try {
    const [row] = await db.update(products).set(patch).where(eq(products.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "SKU duplicado" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error guardando producto" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  await db.update(products).set({ active: false }).where(eq(products.id, id));
  return NextResponse.json({ ok: true });
}
