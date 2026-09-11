import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { garmentMolds } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { garmentMoldSchema } from "@/lib/validators";
import { asc, eq } from "drizzle-orm";

export async function GET() {
  await requireUser();
  const rows = await db.select().from(garmentMolds).where(eq(garmentMolds.active, true)).orderBy(asc(garmentMolds.name));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  await requireUser();
  const parsed = garmentMoldSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  const [row] = await db.insert(garmentMolds).values({
    name: d.name,
    family: d.family,
    measurementSchema: { required: d.requiredMeasurements, optional: d.optionalMeasurements },
    notes: d.notes ?? null,
  }).returning();
  return NextResponse.json(row);
}
