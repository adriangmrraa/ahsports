import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { generatePublicToken } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  if (!body?.notes) {
    return NextResponse.json({ error: "Notas requeridas" }, { status: 400 });
  }
  const status = body.status ?? "borrador";
  const [row] = await db
    .insert(orders)
    .values({
      publicToken: generatePublicToken(),
      status,
      urgent: body.urgent === "true" || body.urgent === true,
      notes: String(body.notes),
      createdById: user.id,
    })
    .returning({ id: orders.id });
  return NextResponse.json(row);
}