import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createSession, verifyPassword } from "@/lib/auth";
import { checkLoginThrottle, DUMMY_PASSWORD_HASH } from "@/lib/auth/throttle";
import { clientIpFromRequest } from "@/lib/infra/rate-limit";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // The throttle key is normalized so casing games share one bucket; the
  // account lookup stays exact — Postgres `=` is case-sensitive on email.
  const throttle = checkLoginThrottle(clientIpFromRequest(req), body.email);

  const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);

  // Always pay exactly one scrypt comparison — known users compare against
  // their hash, unknown or inactive ones against a constant dummy, so the
  // response timing never reveals account existence or active state.
  const passwordMatch = verifyPassword(body.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  const credentialsOk = !!user && user.active && passwordMatch;

  if (!throttle.allowed) {
    // A throttled request always answers 429 — never the 401/200 split that
    // would turn the limiter into a "credentials were valid" oracle.
    if (credentialsOk) {
      // Correct credentials held back by a limiter = a targeted lockout or a
      // distributed attack succeeding — worth a signal. Opaque flags only.
      console.warn(
        `[auth] valid login blocked by login throttle (ipLimited=${throttle.ipLimited}, emailLimited=${throttle.emailLimited})`,
      );
    }
    return NextResponse.json({ error: "Demasiados intentos. Esperá unos minutos." }, { status: 429 });
  }

  if (!user || !credentialsOk) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
