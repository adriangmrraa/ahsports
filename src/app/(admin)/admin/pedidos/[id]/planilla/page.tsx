import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { orderItems, orderLines, orders, products, sizes } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { PageGuide } from "@/components/admin/PageGuide";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { PlanillaTable } from "./PlanillaTable";

export default async function PlanillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) notFound();

  const lines = await db
    .select({
      id: orderLines.id,
      quantity: orderLines.quantity,
      productId: orderLines.productId,
      productName: products.name,
      productSku: products.sku,
      notes: orderLines.notes,
    })
    .from(orderLines)
    .leftJoin(products, eq(orderLines.productId, products.id))
    .where(eq(orderLines.orderId, id))
    .orderBy(asc(orderLines.id));

  const items = await db
    .select({
      id: orderItems.id,
      orderLineId: orderItems.orderLineId,
      individualName: orderItems.individualName,
      individualNumber: orderItems.individualNumber,
      status: orderItems.status,
      sizeLabel: sizes.label,
    })
    .from(orderItems)
    .innerJoin(orderLines, eq(orderItems.orderLineId, orderLines.id))
    .leftJoin(sizes, eq(orderItems.sizeId, sizes.id))
    .where(eq(orderLines.orderId, id));

  return (
    <>
      <PageHeader
        title={`Pedido #${order.number} — Planilla`}
        subtitle={`${items.length} prendas en ${lines.length} líneas`}
        action={
          <>
            <Link href={`/admin/pedidos/${id}`} className="text-xs label-caps text-primary hover:underline self-center">
              ← Ficha
            </Link>
            <LinkButton href={`/admin/pedidos/${id}/linea/nueva`} variant="primary" size="sm">
              Agregar línea
            </LinkButton>
          </>
        }
      />
      <PageGuide
        what="La planilla es la lista prenda por prenda: talle, nombre y número de cada unidad a producir."
        whatFor="Se arma sola a partir de las líneas. Cada prenda avanza por etapas (corte, confección, estampado, control)."
      />

      {lines.length === 0 ? (
        <AdminEmptyState
          title="Sin líneas aún"
          what="Sin líneas no hay prendas que producir ni planilla que seguir."
          whatFor="Agregá la primera línea con cantidades por talle."
          action={<LinkButton href={`/admin/pedidos/${id}/linea/nueva`}>Agregar línea</LinkButton>}
        />
      ) : (
        <PlanillaTable
          orderId={id}
          lines={lines.map((l) => ({
            id: l.id,
            quantity: l.quantity,
            productName: l.productName ?? l.productId,
            productSku: l.productSku ?? "",
            notes: l.notes,
          }))}
          items={items}
        />
      )}
    </>
  );
}
