import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { contacts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { contactSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const [row] = await db
    .insert(contacts)
    .values({
      organizationId: d.organizationId ?? null,
      name: d.name,
      email: d.email ?? null,
      phone: d.phone ?? null,
      role: d.role ?? null,
      notes: d.notes ?? null,
      status: d.status,
    })
    .returning();
  return NextResponse.json(row);
}
