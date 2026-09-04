import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { applications, attachments, orderItems, orderLines, orders, products, productionEvents, sizes, techniques } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHeader, Card, Badge } from "@/components/ui/Card";
import { ItemEditor } from "./ItemEditor";
import { ItemStageAdvance } from "./ItemStageAdvance";

const stageLabel: Record<string, string> = {
  ingreso: "Ingreso",
  corte: "Corte",
  confeccion: "Confección",
  estampado: "Estampado",
  control: "Control",
  entrega: "Entrega",
};

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) notFound();

  const [row] = await db
    .select({
      item: orderItems,
      sizeLabel: sizes.label,
      productName: products.name,
      productSku: products.sku,
      lineId: orderLines.id,
      lineNotes: orderLines.notes,
    })
    .from(orderItems)
    .innerJoin(orderLines, eq(orderItems.orderLineId, orderLines.id))
    .leftJoin(sizes, eq(orderItems.sizeId, sizes.id))
    .leftJoin(products, eq(orderLines.productId, products.id))
    .where(eq(orderItems.id, itemId))
    .limit(1);
  if (!row || row.item.orderLineId !== row.lineId) notFound();

  // Verificar que el item pertenece a este pedido.
  const [line] = await db.select().from(orderLines).where(eq(orderLines.id, row.item.orderLineId)).limit(1);
  if (!line || line.orderId !== id) notFound();

  const itemAtts = await db.select().from(attachments).where(eq(attachments.orderItemId, itemId));
  const itemApps = itemAtts.length > 0
    ? await db
        .select({ zone: applications.zone, view: applications.view, techniqueName: techniques.name, instructions: applications.instructions })
        .from(applications)
        .leftJoin(techniques, eq(applications.techniqueId, techniques.id))
        .where(eq(applications.attachmentId, itemAtts[0].id))
    : [];
  const lineApps = await db
    .select({ zone: applications.zone, view: applications.view, techniqueName: techniques.name })
    .from(applications)
    .leftJoin(techniques, eq(applications.techniqueId, techniques.id))
    .where(eq(applications.orderLineId, line.id));

  const history = await db
    .select()
    .from(productionEvents)
    .where(eq(productionEvents.orderItemId, itemId))
    .orderBy(desc(productionEvents.createdAt))
    .limit(20);

  return (
    <>
      <PageHeader
        title={`Prenda · ${row.productName ?? "Producto"} ${row.sizeLabel ? `· Talle ${row.sizeLabel}` : ""}`}
        subtitle={`Pedido #${order.number}`}
        action={
          <Link href={`/admin/pedidos/${id}/planilla`} className="text-xs label-caps text-primary hover:underline">
            ← Planilla
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title="Datos"
          action={<Badge tone="muted">{stageLabel[row.item.status] ?? row.item.status}</Badge>}
        >
          <ItemEditor
            itemId={itemId}
            initialName={row.item.individualName ?? ""}
            initialNumber={row.item.individualNumber ?? ""}
          />
          {row.lineNotes && <p className="text-xs text-on-surface-variant mt-3">Línea: {row.lineNotes}</p>}
          <div className="mt-4 pt-4 border-t border-outline-variant">
            <ItemStageAdvance itemId={itemId} current={row.item.status} />
          </div>
        </Card>

        <Card title="Aplicaciones">
          {[...itemApps, ...lineApps].length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-4">Sin aplicaciones para esta prenda.</p>
          ) : (
            <ul className="space-y-2">
              {itemApps.map((a, i) => (
                <li key={`i-${i}`} className="rounded-md border border-outline-variant p-3 text-sm">
                  <p className="text-on-surface font-bold">{a.zone} · {a.view}</p>
                  <p className="text-xs text-on-surface-variant">
                    {a.techniqueName ? `Técnica: ${a.techniqueName}` : "Sin técnica"}
                    {a.instructions ? ` · ${a.instructions}` : ""}
                  </p>
                </li>
              ))}
              {lineApps.map((a, i) => (
                <li key={`l-${i}`} className="rounded-md border border-outline-variant/60 p-3 text-sm">
                  <p className="text-on-surface font-bold">{a.zone} · {a.view} <span className="text-xs font-normal text-on-surface-variant">(línea)</span></p>
                  <p className="text-xs text-on-surface-variant">{a.techniqueName ? `Técnica: ${a.techniqueName}` : "Sin técnica"}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Historial" className="mt-4">
        {history.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-4">Sin movimientos registrados.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between items-center text-sm py-1 border-b border-outline-variant/50 last:border-0">
                <span className="text-on-surface">
                  Etapa: <span className="label-caps text-primary">{stageLabel[h.stage] ?? h.stage}</span>
                  {h.note ? <span className="text-on-surface-variant"> · {h.note}</span> : null}
                </span>
                <span className="data-mono text-xs text-on-surface-variant">
                  {h.createdAt ? new Date(h.createdAt).toLocaleString("es-AR") : "-"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
