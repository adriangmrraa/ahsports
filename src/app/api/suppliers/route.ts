import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { suppliers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isUniqueViolation, supplierSchema } from "@/lib/validators";
import { asc, eq } from "drizzle-orm";

export async function GET() {
  await requireUser();
  const rows = await db.select().from(suppliers).where(eq(suppliers.active, true)).orderBy(asc(suppliers.name)).limit(500);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  try {
    const [row] = await db.insert(suppliers).values({
      name: d.name,
      phone: d.phone ?? null,
      email: d.email ?? null,
      address: d.address ?? null,
      contactName: d.contactName ?? null,
      taxId: d.taxId ?? null,
      notes: d.notes ?? null,
    }).returning();
    return NextResponse.json(row);
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: "Ya existe un proveedor con ese nombre" }, { status: 409 });
    throw error;
  }
}
