import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { fabrics, orders, productFabrics, productTechniques, products, sizes, techniques } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { AddLineForm } from "./AddLineForm";

export default async function NuevaLineaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) notFound();

  const editable = ["borrador", "presupuesto_enviado", "aprobado"].includes(order.status);

  const prods = await db
    .select()
    .from(products)
    .where(eq(products.active, true))
    .orderBy(asc(products.name))
    .limit(200);
  const techs = await db
    .select({ id: techniques.id, name: techniques.name, requiresSublimableFabric: techniques.requiresSublimableFabric })
    .from(techniques)
    .where(eq(techniques.active, true))
    .orderBy(asc(techniques.name));
  const fabricRows = await db
    .select({ id: fabrics.id, name: fabrics.name, sublimable: fabrics.sublimable })
    .from(fabrics)
    .where(eq(fabrics.active, true))
    .orderBy(asc(fabrics.sortOrder), asc(fabrics.name));
  const allSizes = prods.length > 0
    ? await db.select().from(sizes).where(inArray(sizes.productId, prods.map((p) => p.id)))
    : [];
  const [fabricLinks, techniqueLinks] = prods.length > 0
    ? await Promise.all([
        db.select({ productId: productFabrics.productId, fabricId: productFabrics.fabricId })
          .from(productFabrics).where(inArray(productFabrics.productId, prods.map((p) => p.id))),
        db.select({ productId: productTechniques.productId, techniqueId: productTechniques.techniqueId })
          .from(productTechniques).where(inArray(productTechniques.productId, prods.map((p) => p.id))),
      ])
    : [[], []];
  const productOptions: Record<string, { fabricIds: string[]; techniqueIds: string[] }> = {};
  for (const row of fabricLinks) {
    (productOptions[row.productId] ??= { fabricIds: [], techniqueIds: [] }).fabricIds.push(row.fabricId);
  }
  for (const row of techniqueLinks) {
    (productOptions[row.productId] ??= { fabricIds: [], techniqueIds: [] }).techniqueIds.push(row.techniqueId);
  }

  return (
    <>
      <PageHeader title={`Pedido #${order.number} — Nueva línea`} subtitle="Agregá un producto con cantidades por talle" />
      <Card>
        {editable ? (
          <AddLineForm
            orderId={order.id}
            products={prods.map((p) => ({
              id: p.id,
              sku: p.sku,
              name: p.name,
              basePrice: String(p.basePrice),
              zones: (p.zones ?? []) as string[],
            }))}
            techniques={techs}
            fabrics={fabricRows}
            productOptions={productOptions}
            sizes={allSizes.map((s) => ({ id: s.id, productId: s.productId, label: s.label, order: s.order }))}
          />
        ) : (
          <p className="text-sm text-on-surface-variant text-center py-6">
            El pedido está en estado {order.status} y no admite nuevas líneas.
          </p>
        )}
      </Card>
    </>
  );
}
