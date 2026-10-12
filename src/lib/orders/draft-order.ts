import { randomBytes } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import type { DbTransaction } from "@/lib/db-transaction";
import { contacts, orderItems, orderLines, orders, organizations, products, sizes } from "@/db/schema";

/**
 * Transactional core for creating an order in `borrador`.
 *
 * This is the shared internals behind BOTH the public wizard action
 * (`createPublicOrder`, `src/app/actions/public-orders.ts`) and the guarded
 * draft-order agent tool (`draftOrder`). It writes ONLY draft state: the order
 * is always `borrador`, prices start at "0" and no payment, production or
 * finalization path is ever touched here.
 *
 * Callers MUST invoke it inside `withDbTransaction` so the organization,
 * contact, order, line and items stay atomic.
 */

export class OrderDraftDomainError extends Error {}

export type DraftSizeQuantity = { sizeId: string | null; quantity: number };
export type DraftOrderItem = {
  sizeId: string | null;
  individualName?: string | null;
  individualNumber?: string | null;
};

export type DraftOrderTxInput = {
  type: "new" | "returning";
  name: string;
  email: string;
  phone: string;
  organizationName?: string;
  /** Note stored on a newly-created organization; defaults to a neutral label. */
  organizationNotes?: string;
  notes?: string;
  productId: string;
  sizeQuantities: DraftSizeQuantity[];
  items: DraftOrderItem[];
};

export type DraftOrderTxResult = {
  orderId: string;
  number: number;
  publicToken: string;
  contactId: string;
  organizationId: string | null;
};

export async function createOrderDraftTx(
  tx: DbTransaction,
  data: DraftOrderTxInput,
): Promise<DraftOrderTxResult> {
  const [product] = await tx.select({ id: products.id, minOrder: products.minOrder })
    .from(products).where(and(eq(products.id, data.productId), eq(products.active, true))).limit(1);
  if (!product) throw new OrderDraftDomainError("El producto seleccionado ya no está disponible");

  const requestedSizeIds = data.sizeQuantities.flatMap((entry) => entry.sizeId ? [entry.sizeId] : []);
  const productSizes = requestedSizeIds.length > 0
    ? await tx.select({ id: sizes.id }).from(sizes)
      .where(and(eq(sizes.productId, product.id), inArray(sizes.id, requestedSizeIds)))
    : [];
  if (productSizes.length !== requestedSizeIds.length) {
    throw new OrderDraftDomainError("Uno o más talles no corresponden al producto seleccionado");
  }

  const expectedItems = data.sizeQuantities.reduce((sum, entry) => sum + entry.quantity, 0);
  if (expectedItems < product.minOrder) throw new OrderDraftDomainError(`El pedido mínimo es de ${product.minOrder} prendas`);
  if (expectedItems !== data.items.length) {
    throw new OrderDraftDomainError("Las cantidades por talle no coinciden con las prendas personalizadas");
  }
  const itemCounts = new Map<string | null, number>();
  for (const item of data.items) itemCounts.set(item.sizeId, (itemCounts.get(item.sizeId) ?? 0) + 1);
  for (const entry of data.sizeQuantities) {
    if (itemCounts.get(entry.sizeId) !== entry.quantity) {
      throw new OrderDraftDomainError("Las prendas personalizadas no coinciden con las cantidades por talle");
    }
  }

  let organizationId: string | null = null;
  if (data.organizationName) {
    const [existing] = await tx.select({ id: organizations.id }).from(organizations)
      .where(eq(organizations.name, data.organizationName)).limit(1);
    if (existing) organizationId = existing.id;
    else {
      const [created] = await tx.insert(organizations).values({
        name: data.organizationName, kind: "club", notes: data.organizationNotes ?? "Creada desde borrador",
      }).returning({ id: organizations.id });
      if (!created) throw new OrderDraftDomainError("No se pudo crear la organización");
      organizationId = created.id;
    }
  }

  const [existingContact] = await tx.select({ id: contacts.id, organizationId: contacts.organizationId })
    .from(contacts).where(or(eq(contacts.email, data.email), eq(contacts.phone, data.phone))).limit(1);
  let contactId: string;
  if (existingContact) {
    if (organizationId && existingContact.organizationId && existingContact.organizationId !== organizationId) {
      throw new OrderDraftDomainError("El contacto no pertenece a la organización indicada");
    }
    contactId = existingContact.id;
    organizationId ??= existingContact.organizationId;
  } else {
    if (data.type === "returning") throw new OrderDraftDomainError("No encontramos ese cliente. Iniciá una solicitud como cliente nuevo");
    const [created] = await tx.insert(contacts).values({
      name: data.name, email: data.email, phone: data.phone, organizationId, role: "cliente", notes: data.notes,
    }).returning({ id: contacts.id });
    if (!created) throw new OrderDraftDomainError("No se pudo crear el contacto");
    contactId = created.id;
  }

  const publicToken = randomBytes(24).toString("base64url");
  const [order] = await tx.insert(orders).values({
    publicToken, organizationId, contactId, status: "borrador", urgent: false, notes: data.notes ?? null,
  }).returning({ id: orders.id, number: orders.number });
  if (!order) throw new OrderDraftDomainError("No se pudo crear el pedido");
  const [line] = await tx.insert(orderLines).values({
    orderId: order.id, productId: product.id, quantity: expectedItems, unitPrice: "0", unitCost: "0",
  }).returning({ id: orderLines.id });
  if (!line) throw new OrderDraftDomainError("No se pudo crear la línea del pedido");

  await tx.insert(orderItems).values(data.items.map((item) => ({
    orderLineId: line.id, sizeId: item.sizeId,
    individualName: item.individualName || null, individualNumber: item.individualNumber || null,
  })));

  return { orderId: order.id, number: order.number, publicToken, contactId, organizationId };
}
