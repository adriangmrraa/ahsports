import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { techniques } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { techniqueSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = techniqueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const [row] = await db.insert(techniques).values({
    name: d.name,
    costPerUnit: String(d.costPerUnit),
    costPerSquareMeter: String(d.costPerSquareMeter),
    setupCost: String(d.setupCost),
    description: d.description ?? null,
  }).returning();
  return NextResponse.json(row);
}
