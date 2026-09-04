import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { eq } from "drizzle-orm";

const SESSION_COOKIE = "ah_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const target = Buffer.from(hash, "hex");
  return candidate.length === target.length && timingSafeEqual(candidate, target);
}

function sign(value: string) {
  const secret = process.env.SESSION_SECRET || "dev-secret-please-change-in-production";
  return createHmac("sha256", secret).update(value).digest("hex");
}

function verifySignature(value: string, signature: string) {
  const expected = sign(value);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function createSession(userId: string) {
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id, userId, expiresAt });
  const signature = sign(id);
  const value = `${id}.${signature}`;
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (cookie) {
    const [id] = cookie.value.split(".");
    if (id) await db.delete(sessions).where(eq(sessions.id, id));
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (!cookie) return null;
  const [id, signature] = cookie.value.split(".");
  if (!id || !signature || !verifySignature(id, signature)) return null;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!session || session.expiresAt < new Date()) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(roles: Array<"admin" | "gerencia" | "disenador" | "operario">) {
  const user = await requireUser();
  if (!roles.includes(user.role as never)) redirect("/admin");
  return user;
}

export function quickHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}