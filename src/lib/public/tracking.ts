import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { attachments, orderItems, orderLines, orders, products, sizes, type PricingSnapshot } from "@/db/schema";

export type PublicTrackingItem = {
  id: string;
  sizeLabel: string | null;
  individualName: string | null;
  individualNumber: string | null;
};

export type PublicTrackingLine = {
  id: string;
  productName: string | null;
  productImageUrl: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  items: PublicTrackingItem[];
};

export type PublicTracking = {
  order: {
    id: string;
    number: number;
    status: string;
    notes: string | null;
    createdAt: Date;
    totalQuoted: number;
    snapshot: PricingSnapshot | null;
  };
  lines: PublicTrackingLine[];
  approvedAttachments: {
    id: string;
    url: string;
    name: string;
    mimeType: string | null;
  }[];
};

/**
 * Everything /seguimiento/[token] renders, in one read. Only public-safe
 * columns are selected — `internalNotes`, costs and non-approved attachments
 * never leave the server for this route.
 */
export async function loadPublicTracking(token: string): Promise<PublicTracking | null> {
  const [order] = await db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      notes: orders.notes,
      createdAt: orders.createdAt,
      totalQuoted: orders.totalQuoted,
      snapshot: orders.snapshot,
    })
    .from(orders)
    .where(eq(orders.publicToken, token))
    .limit(1);
  if (!order) return null;

  const [lineRows, itemRows, attachmentRows] = await Promise.all([
    db
      .select({
        id: orderLines.id,
        quantity: orderLines.quantity,
        unitPrice: orderLines.unitPrice,
        productName: products.name,
        productImageUrl: products.imageUrl,
      })
      .from(orderLines)
      .leftJoin(products, eq(orderLines.productId, products.id))
      .where(eq(orderLines.orderId, order.id)),
    db
      .select({
        id: orderItems.id,
        orderLineId: orderItems.orderLineId,
        sizeLabel: sizes.label,
        individualName: orderItems.individualName,
        individualNumber: orderItems.individualNumber,
      })
      .from(orderItems)
      .innerJoin(orderLines, eq(orderItems.orderLineId, orderLines.id))
      .leftJoin(sizes, eq(orderItems.sizeId, sizes.id))
      .where(eq(orderLines.orderId, order.id)),
    db
      .select({ id: attachments.id, url: attachments.url, name: attachments.name, mimeType: attachments.mimeType })
      .from(attachments)
      .where(and(eq(attachments.orderId, order.id), eq(attachments.status, "aprobado"))),
  ]);

  const itemsByLine = new Map<string, PublicTrackingItem[]>();
  for (const row of itemRows) {
    const list = itemsByLine.get(row.orderLineId) ?? [];
    list.push({
      id: row.id,
      sizeLabel: row.sizeLabel,
      individualName: row.individualName,
      individualNumber: row.individualNumber,
    });
    itemsByLine.set(row.orderLineId, list);
  }

  return {
    order: {
      id: order.id,
      number: order.number,
      status: order.status,
      notes: order.notes,
      createdAt: order.createdAt,
      totalQuoted: Number(order.totalQuoted),
      snapshot: order.snapshot,
    },
    lines: lineRows.map((line) => {
      const unitPrice = Number(line.unitPrice);
      return {
        id: line.id,
        productName: line.productName,
        productImageUrl: line.productImageUrl,
        quantity: line.quantity,
        unitPrice,
        subtotal: unitPrice * line.quantity,
        items: itemsByLine.get(line.id) ?? [],
      };
    }),
    approvedAttachments: attachmentRows.map((a) => ({ id: a.id, url: a.url, name: a.name, mimeType: a.mimeType })),
  };
}
