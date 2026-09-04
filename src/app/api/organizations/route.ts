import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { organizationSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = organizationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const [row] = await db
    .insert(organizations)
    .values({
      name: d.name,
      kind: d.kind,
      taxId: d.taxId ?? null,
      notes: d.notes ?? null,
    })
    .returning();
  return NextResponse.json(row);
}
