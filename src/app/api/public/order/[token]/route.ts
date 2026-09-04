import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { attachments, orderItems, orderLines, orders, products } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

/**
 * F4-15 — GET /api/public/order/[token]: endpoint público seguro.
 * Expone SOLO lo que el cliente puede ver (no costos internos, no pagos, no notas).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [order] = await db.select().from(orders).where(eq(orders.publicToken, token)).limit(1);
  if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));

  const lineIds = lines.map((l) => l.id);
  const [items, atts, productsList] = await Promise.all([
    lineIds.length ? db.select().from(orderItems).where(inArray(orderItems.orderLineId, lineIds)) : Promise.resolve([]),
    db.select().from(attachments).where(eq(attachments.orderId, order.id)),
    db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, lines.map((l) => l.productId))),
  ]);
  const productName = (id: string) => productsList.find((p) => p.id === id)?.name ?? "Producto";

  return NextResponse.json({
    number: order.number,
    status: order.status,
    publicToken: order.publicToken,
    createdAt: order.createdAt,
    urgent: order.urgent,
    lines: lines.map((l) => ({
      productName: productName(l.productId),
      quantity: l.quantity,
      items: items
        .filter((i) => i.orderLineId === l.id)
        .map((i) => ({ talle: i.sizeId ?? null, name: i.individualName, number: i.individualNumber, status: i.status })),
    })),
    attachments: atts.map((a) => ({ name: a.name, kind: a.kind, status: a.status, url: a.url, mimeType: a.mimeType })),
  });
}