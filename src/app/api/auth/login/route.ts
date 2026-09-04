import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createSession, verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
  if (!user || !user.active || !verifyPassword(body.password, user.passwordHash)) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}