import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { attachments, uploadSessions } from "@/db/schema";
import { activeStorage } from "@/lib/storage";

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export type PublicUploadSession = { id: string; secret: string; expiresAt: string };

function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function matchesPublicUploadSecret(secretHash: string, secret: string) {
  const expected = Buffer.from(secretHash, "hex");
  const supplied = Buffer.from(hashSecret(secret), "hex");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

/** Creates a one-time proof of ownership for assets staged before an order exists. */
export async function createPublicUploadSession(): Promise<PublicUploadSession> {
  const secret = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const [session] = await db
    .insert(uploadSessions)
    .values({ secretHash: hashSecret(secret), expiresAt })
    .returning({ id: uploadSessions.id, expiresAt: uploadSessions.expiresAt });
  if (!session) throw new Error("No se pudo iniciar la carga de archivos");
  return { id: session.id, secret, expiresAt: session.expiresAt.toISOString() };
}

/**
 * Looks up a live session and verifies its opaque secret without ever exposing
 * the stored hash to callers. The same check runs again inside order creation.
 */
export async function getLivePublicUploadSession(sessionId: string, secret: string) {
  const [session] = await db
    .select()
    .from(uploadSessions)
    .where(and(eq(uploadSessions.id, sessionId), eq(uploadSessions.status, "active")))
    .limit(1);
  if (!session || session.expiresAt <= new Date()) return null;
  if (!matchesPublicUploadSecret(session.secretHash, secret)) return null;
  return session;
}

/**
 * Soft-deletes expired staged rows after deleting their backing object. Failed
 * provider deletes are deliberately retained for a later retry instead of
 * erasing metadata while leaving an untraceable object behind.
 */
export async function cleanupExpiredPublicUploads(now = new Date()) {
  const expiredSessions = await db
    .select({ id: uploadSessions.id })
    .from(uploadSessions)
    .where(and(eq(uploadSessions.status, "active"), lt(uploadSessions.expiresAt, now)))
    .limit(100);
  if (expiredSessions.length === 0) return { sessions: 0, attachments: 0 };

  const sessionIds = expiredSessions.map((session) => session.id);
  const staged = await db
    .select({ id: attachments.id, url: attachments.url })
    .from(attachments)
    .where(and(inArray(attachments.uploadSessionId, sessionIds), isNull(attachments.orderId), isNull(attachments.deletedAt)));

  const deletedIds: string[] = [];
  for (const attachment of staged) {
    try {
      await activeStorage.delete(attachment.url);
      deletedIds.push(attachment.id);
    } catch {
      // Keep the row active for a subsequent cleanup attempt.
    }
  }
  if (deletedIds.length > 0) {
    await db.update(attachments).set({ deletedAt: now }).where(inArray(attachments.id, deletedIds));
  }
  await db.update(uploadSessions).set({ status: "expired" }).where(inArray(uploadSessions.id, sessionIds));
  return { sessions: sessionIds.length, attachments: deletedIds.length };
}
