import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { productSchema, isUniqueViolation } from "@/lib/validators";

export async function POST(req: NextRequest) {
  await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  try {
    const [row] = await db.insert(products).values({
      sku: d.sku,
      name: d.name,
      description: d.description ?? null,
      category: d.category ?? null,
      basePrice: String(d.basePrice),
      minOrder: d.minOrder,
      zones: d.zones,
    }).returning();
    return NextResponse.json(row);
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "SKU duplicado" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error guardando producto" }, { status: 500 });
  }
}
