import "server-only";

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { cashMovements, cashSessions, payments } from "@/db/schema";
import { toCents } from "@/lib/payments";

/**
 * A-13 — Physical cash drawer ("caja física") for in-person pickup payments.
 *
 * Port of SocialCRM `src/lib/cash/session.ts`, minimized for the textile
 * domain: AH Sports collects efectivo when customers pick up finished orders,
 * so a drawer with expected-vs-actual close is real — but the factory does
 * not run past midnight, so the 02:00 automatic rollover of the food domain
 * is intentionally NOT ported. Sessions still form a continuous chain: each
 * new session opens where the previous one closed (openedAt = previous
 * closedAt, openingCash = previous actualCash), so no cash payment can fall
 * outside a window or inside two at once.
 *
 * Immutability: a closed session has NO update path — the app layer exposes
 * open/close/movement only. To correct a wrong count the operator records a
 * compensating movement in the next session and notes it; the closed row is
 * the frozen audit seat (`report` holds the full snapshot taken at close).
 *
 * Money is counted in integer cents (numeric columns arrive as strings — see
 * src/lib/payments.ts); floats never touch a sum.
 */

export type CashSession = typeof cashSessions.$inferSelect;

export interface CashSnapshot {
  sessionId: string;
  openedAt: Date;
  openingCash: number;
  cashPayments: Array<{ paymentId: string; orderId: string | null; amount: number; kind: string }>;
  cashTotal: number;
  nonCashByMethod: Record<string, { count: number; total: number }>;
  movementsIn: number;
  movementsOut: number;
  expectedCash: number;
}

export interface CloseResult extends CashSnapshot {
  closedAt: Date;
  actualCash: number;
  difference: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export async function getOpenSession(): Promise<CashSession | null> {
  const [row] = await db
    .select()
    .from(cashSessions)
    .where(eq(cashSessions.status, "open"))
    .orderBy(desc(cashSessions.openedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Returns the open session or creates one preserving the chain: openedAt =
 * closedAt of the last closed session (now when there is no history) and
 * openingCash = its actualCash (0 otherwise) — payments taken "with the
 * drawer closed" still land inside the next window.
 */
export async function ensureOpenSession(): Promise<CashSession> {
  const open = await getOpenSession();
  if (open) return open;

  const [lastClosed] = await db
    .select()
    .from(cashSessions)
    .where(eq(cashSessions.status, "closed"))
    .orderBy(desc(cashSessions.closedAt))
    .limit(1);

  const [created] = await db
    .insert(cashSessions)
    .values({
      status: "open",
      openedAt: lastClosed?.closedAt ?? new Date(),
      openingCash: lastClosed?.actualCash ?? "0",
    })
    .returning();
  return created;
}

/**
 * Explicit open (operator-facing). Unlike ensureOpenSession it does NOT
 * backdate — openedAt = now. Refuses when a session is already open.
 */
export async function openSession(openingCash: number, openedBy?: string): Promise<CashSession> {
  if (!Number.isFinite(openingCash) || openingCash < 0) {
    throw new Error("El fondo inicial de caja tiene que ser un número mayor o igual a 0.");
  }
  const existing = await getOpenSession();
  if (existing) {
    throw new Error(`Ya hay una sesión de caja abierta. Cerrala antes de abrir otra.`);
  }
  const [created] = await db
    .insert(cashSessions)
    .values({
      status: "open",
      openedAt: new Date(),
      openingCash: openingCash.toFixed(2),
      ...(openedBy ? { notes: `Abierta por ${openedBy}` } : {}),
    })
    .returning();
  return created;
}

/** Manual in/out inside the CURRENT session (e.g. retiro de cambio, gasto). */
export async function addMovement(
  direction: "in" | "out",
  amount: number,
  reason: string,
  by?: string,
): Promise<typeof cashMovements.$inferSelect> {
  if (direction !== "in" && direction !== "out") {
    throw new Error("La dirección del movimiento tiene que ser 'in' u 'out'.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("El monto del movimiento tiene que ser un número mayor a 0.");
  }
  if (!reason?.trim()) {
    throw new Error("El movimiento necesita un motivo.");
  }
  const session = await ensureOpenSession();
  const [movement] = await db
    .insert(cashMovements)
    .values({
      sessionId: session.id,
      direction,
      amount: amount.toFixed(2),
      reason: reason.trim(),
      createdBy: by ?? null,
    })
    .returning();
  return movement;
}

/**
 * Windowed snapshot: payments of the session window [openedAt, closedAt|now)
 * keyed by `payments.date` (the moment money moved), plus manual movements.
 * `method = 'efectivo'` is what lands in the physical drawer — deterministic
 * enum, no keyword matching needed. Cancelled payments never count.
 */
export async function getSnapshot(sessionId: string, windowEndOverride?: Date): Promise<CashSnapshot> {
  const [session] = await db.select().from(cashSessions).where(eq(cashSessions.id, sessionId)).limit(1);
  if (!session) throw new Error(`No encontré la sesión de caja ${sessionId}.`);

  const windowEnd = windowEndOverride ?? session.closedAt ?? new Date();

  const paymentRows = await db
    .select({
      id: payments.id,
      orderId: payments.orderId,
      kind: payments.kind,
      method: payments.method,
      amount: payments.amount,
      cancelled: payments.cancelled,
    })
    .from(payments)
    .where(and(gte(payments.date, session.openedAt), lt(payments.date, windowEnd)));

  const movementRows = await db
    .select({ direction: cashMovements.direction, amount: cashMovements.amount })
    .from(cashMovements)
    .where(eq(cashMovements.sessionId, sessionId));

  const cashPayments: CashSnapshot["cashPayments"] = [];
  const nonCashByMethod: Record<string, { count: number; total: number }> = {};
  let cashCents = 0;

  for (const row of paymentRows) {
    if (row.cancelled) continue;
    const cents = toCents(row.amount);
    if (row.method === "efectivo") {
      cashPayments.push({ paymentId: row.id, orderId: row.orderId, amount: cents / 100, kind: row.kind });
      cashCents += cents;
    } else {
      const bucket = nonCashByMethod[row.method] ?? { count: 0, total: 0 };
      bucket.count += 1;
      bucket.total = round2(bucket.total + cents / 100);
      nonCashByMethod[row.method] = bucket;
    }
  }

  let movementsInCents = 0;
  let movementsOutCents = 0;
  for (const row of movementRows) {
    const cents = toCents(row.amount);
    if (row.direction === "in") movementsInCents += cents;
    else movementsOutCents += cents;
  }

  const openingCents = toCents(session.openingCash);
  return {
    sessionId: session.id,
    openedAt: session.openedAt,
    openingCash: openingCents / 100,
    cashPayments,
    cashTotal: cashCents / 100,
    nonCashByMethod,
    movementsIn: movementsInCents / 100,
    movementsOut: movementsOutCents / 100,
    expectedCash: (openingCents + cashCents + movementsInCents - movementsOutCents) / 100,
  };
}

/**
 * Idempotent close: the `status='open'` predicate in the WHERE makes the
 * check atomic — a concurrent close touches zero rows and loses the race.
 * Uses getOpenSession (not ensure) on purpose: there is no point creating an
 * empty session just to close it. The frozen `report` is the audit seat.
 */
export async function closeSession(
  actualCash: number,
  closedBy: string,
  notes?: string,
): Promise<CloseResult | { error: string }> {
  if (!Number.isFinite(actualCash) || actualCash < 0) {
    return { error: "El conteo físico de caja tiene que ser un número mayor o igual a 0." };
  }
  const session = await getOpenSession();
  if (!session) {
    return { error: "No hay ninguna sesión de caja abierta para cerrar." };
  }

  const snapshot = await getSnapshot(session.id);
  const closedAt = new Date();
  const difference = round2(actualCash - snapshot.expectedCash);

  const [updated] = await db
    .update(cashSessions)
    .set({
      status: "closed",
      closedAt,
      expectedCash: snapshot.expectedCash.toFixed(2),
      actualCash: actualCash.toFixed(2),
      difference: difference.toFixed(2),
      closedBy: closedBy?.trim() || "sistema",
      report: snapshot as unknown as Record<string, unknown>,
      ...(notes !== undefined ? { notes } : {}),
    })
    .where(and(eq(cashSessions.id, session.id), eq(cashSessions.status, "open")))
    .returning();

  if (!updated) {
    return { error: "La sesión de caja ya estaba cerrada." };
  }
  return { ...snapshot, closedAt, actualCash, difference };
}
