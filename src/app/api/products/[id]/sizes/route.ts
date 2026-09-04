import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { sizes, products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { sizesBatchSchema } from "@/lib/validators";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const parsed = sizesBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }

  await db.delete(sizes).where(eq(sizes.productId, id));
  if (parsed.data.sizes.length > 0) {
    await db.insert(sizes).values(parsed.data.sizes.map((s) => ({
      productId: id,
      label: s.label,
      order: s.order,
      measurements: s.measurements,
    })));
  }
  return NextResponse.json({ ok: true });
}
