import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { fabrics } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fabricSchema, isUniqueViolation } from "@/lib/validators";

export async function POST(req: NextRequest) {
  await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = fabricSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  try {
    const [row] = await db.insert(fabrics).values({
      name: d.name,
      sublimable: d.sublimable,
      priceModifier: String(d.priceModifier),
      sortOrder: d.sortOrder,
    }).returning();
    return NextResponse.json(row);
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "Ya existe una tela con ese nombre" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error guardando la tela" }, { status: 500 });
  }
}
