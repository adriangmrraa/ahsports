import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orderContextItems } from "@/db/schema";

/**
 * A-09 — Conversation-scoped pre-draft cart ("order context").
 *
 * Port of SocialCRM `src/lib/order-context.ts`, adapted to the AH textile
 * schema: string conversation ids, product/size references resolved
 * server-side, and no prices stored — AH never persists a price the pricing
 * engine did not compute, so the cart holds catalog references only and
 * `draftFromCart` re-quotes through `quoteOrder()` at draft time.
 *
 * TTL semantics (unchanged): every row carries `expiresAt` = now + 30min;
 * each add refreshes it and expired rows are swept to `ordered` so they can
 * never resurface as the active cart. Only the status=active, unexpired rows
 * are the "current cart". When a draft is created the rows flip to `ordered`
 * — a cart is single-use.
 */

const TTL_MINUTES = 30;

export type OrderContextItem = {
  id: string;
  productId: string | null;
  productName: string;
  sizeLabel: string | null;
  techniqueName: string | null;
  quantity: number;
  notes: string | null;
};

function futureDate(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

/** Expired active rows of this conversation become inert (`ordered`). */
async function cleanExpiredItems(conversationId: string): Promise<void> {
  await db
    .update(orderContextItems)
    .set({ status: "ordered" })
    .where(
      and(
        eq(orderContextItems.conversationId, conversationId),
        eq(orderContextItems.status, "active"),
        sql`${orderContextItems.expiresAt} < NOW()`,
      ),
    );
}

/**
 * Add or merge a cart row: same product + same size + same technique inside
 * the live window sums quantities and refreshes the TTL; anything else
 * inserts a new row. `productId` may be null when the tool could not resolve
 * the catalog row — the name snapshot is what the draft step will re-resolve.
 */
export async function addOrderContextItem(input: {
  conversationId: string;
  phone: string;
  productId: string | null;
  productName: string;
  sizeLabel?: string | null;
  techniqueName?: string | null;
  quantity?: number;
  notes?: string | null;
}): Promise<void> {
  await cleanExpiredItems(input.conversationId);

  const now = new Date();
  const sizeLabel = input.sizeLabel?.trim() || null;
  const techniqueName = input.techniqueName?.trim() || null;

  const [existing] = await db
    .select({ id: orderContextItems.id, quantity: orderContextItems.quantity })
    .from(orderContextItems)
    .where(
      and(
        eq(orderContextItems.conversationId, input.conversationId),
        eq(orderContextItems.productName, input.productName),
        eq(orderContextItems.status, "active"),
        sizeLabel ? eq(orderContextItems.sizeLabel, sizeLabel) : sql`${orderContextItems.sizeLabel} IS NULL`,
        techniqueName
          ? eq(orderContextItems.techniqueName, techniqueName)
          : sql`${orderContextItems.techniqueName} IS NULL`,
        gt(orderContextItems.expiresAt, now),
      ),
    )
    .limit(1);

  const quantity = input.quantity ?? 1;
  if (existing) {
    await db
      .update(orderContextItems)
      .set({ quantity: existing.quantity + quantity, expiresAt: futureDate(TTL_MINUTES) })
      .where(eq(orderContextItems.id, existing.id));
    return;
  }

  await db.insert(orderContextItems).values({
    conversationId: input.conversationId,
    phone: input.phone,
    productId: input.productId,
    productName: input.productName,
    sizeLabel,
    techniqueName,
    quantity,
    notes: input.notes?.trim() || null,
    status: "active",
    expiresAt: futureDate(TTL_MINUTES),
  });
}

/** Active, unexpired cart rows of the conversation, in insertion order. */
export async function getOrderContextSummary(conversationId: string): Promise<OrderContextItem[]> {
  const now = new Date();
  const rows = await db
    .select()
    .from(orderContextItems)
    .where(
      and(
        eq(orderContextItems.conversationId, conversationId),
        eq(orderContextItems.status, "active"),
        gt(orderContextItems.expiresAt, now),
      ),
    )
    .orderBy(orderContextItems.createdAt);
  return rows.map((row) => ({
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    sizeLabel: row.sizeLabel,
    techniqueName: row.techniqueName,
    quantity: row.quantity,
    notes: row.notes,
  }));
}

/** Removes a single live cart row (id-scoped inside the conversation). */
export async function removeOrderContextItem(conversationId: string, itemId: string): Promise<boolean> {
  const now = new Date();
  const [row] = await db
    .update(orderContextItems)
    .set({ status: "removed" })
    .where(
      and(
        eq(orderContextItems.id, itemId),
        eq(orderContextItems.conversationId, conversationId),
        eq(orderContextItems.status, "active"),
        gt(orderContextItems.expiresAt, now),
      ),
    )
    .returning({ id: orderContextItems.id });
  return Boolean(row);
}

/** Drops every live cart row (e.g. customer says "start over"). */
export async function clearOrderContext(conversationId: string): Promise<number> {
  const now = new Date();
  const rows = await db
    .update(orderContextItems)
    .set({ status: "removed" })
    .where(
      and(
        eq(orderContextItems.conversationId, conversationId),
        eq(orderContextItems.status, "active"),
        gt(orderContextItems.expiresAt, now),
      ),
    )
    .returning({ id: orderContextItems.id });
  return rows.length;
}

/** Marks the whole live cart consumed — called after a draft is persisted. */
export async function markOrderContextOrdered(conversationId: string): Promise<void> {
  const now = new Date();
  await db
    .update(orderContextItems)
    .set({ status: "ordered" })
    .where(
      and(
        eq(orderContextItems.conversationId, conversationId),
        eq(orderContextItems.status, "active"),
        gt(orderContextItems.expiresAt, now),
      ),
    );
}
