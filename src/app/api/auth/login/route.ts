import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createSession, verifyPassword } from "@/lib/auth";

const RATE_LIMIT = 5;
const WINDOW_MS = 60_000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown").slice(0, 64);
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const now = Date.now();
  const prev = attempts.get(ip);
  if (!prev || now >= prev.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    prev.count++;
    if (prev.count > RATE_LIMIT) {
      return NextResponse.json({ error: "Demasiados intentos. Esperá 1 minuto." }, { status: 429 });
    }
  }

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