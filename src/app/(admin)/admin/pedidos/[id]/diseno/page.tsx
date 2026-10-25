import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import {
  attachments,
  configuratorItems,
  designRenders,
  designRevisions,
  orderLines,
  orders,
  products,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { PageHeader, Card, Badge } from "@/components/ui/Card";
import { ArrowLeft } from "lucide-react";
import { listFabricVisualProfiles } from "@/lib/configurator/drafts";
import { loadBundleComponentDescriptors } from "@/lib/configurator/descriptors";
import { normalizeGarmentConfig } from "@/configurator/model";
import { OrderDesignEditor } from "./OrderDesignEditor";

export const metadata = { title: "Diseño del pedido · AH Sports" };

const revisionSourceLabel: Record<string, string> = {
  home: "Web · home",
  wizard: "Web · presupuesto",
  admin: "Administración",
  system: "Sistema",
};

/**
 * Diseño 3D por línea de pedido: mismo GarmentConfigurator que home/wizard en
 * modo admin. Cada guardado appenda una revisión inmutable y repunta
 * order_lines.design_revision_id — el historial nunca se pisa.
 */
export default async function PedidoDisenoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) notFound();

  const lines = await db
    .select({
      id: orderLines.id,
      quantity: orderLines.quantity,
      productId: orderLines.productId,
      designRevisionId: orderLines.designRevisionId,
      productName: products.name,
      productSku: products.sku,
      garmentFamily: products.garmentFamily,
      garmentType: products.garmentType,
      productType: products.productType,
      productKind: products.productKind,
      zones: products.zones,
    })
    .from(orderLines)
    .innerJoin(products, eq(orderLines.productId, products.id))
    .where(eq(orderLines.orderId, id))
    .orderBy(asc(orderLines.id));

  if (lines.length === 0) {
    return (
      <>
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <Link href={`/admin/pedidos/${id}`} className="text-on-surface-variant hover:text-primary"><ArrowLeft className="w-5 h-5" /></Link>
              Diseño · Pedido #{order.number}
            </span>
          }
        />
        <Card>
          <p className="text-sm text-on-surface-variant text-center py-6">
            El pedido no tiene líneas todavía — agregá una para diseñarla.
          </p>
        </Card>
      </>
    );
  }

  const line = lines.find((l) => l.id === sp.line) ?? lines[0];
  if (sp.line && sp.line !== line.id) {
    redirect(`/admin/pedidos/${id}/diseno?line=${encodeURIComponent(line.id)}`);
  }

  const [item] = await db
    .select()
    .from(configuratorItems)
    .where(eq(configuratorItems.orderLineId, line.id))
    .limit(1);

  const revisions = item
    ? await db
        .select()
        .from(designRevisions)
        .where(eq(designRevisions.itemId, item.id))
        .orderBy(desc(designRevisions.revisionNo))
    : [];

  const renderRows = revisions.length > 0
    ? await db
        .select({
          id: designRenders.id,
          revisionId: designRenders.revisionId,
          view: designRenders.view,
          createdAt: designRenders.createdAt,
          url: attachments.url,
        })
        .from(designRenders)
        .leftJoin(attachments, eq(designRenders.attachmentId, attachments.id))
        .where(inArray(designRenders.revisionId, revisions.map((r) => r.id)))
        .orderBy(desc(designRenders.createdAt))
    : [];

  const revisionNoById = new Map(revisions.map((r) => [r.id, r.revisionNo]));
  const currentConfig = item ? normalizeGarmentConfig(item.config) : null;

  // Placement decals resolve through the order's own attachments.
  const assetRefs = (currentConfig?.placements ?? [])
    .map((p) => p.assetRef)
    .filter((x): x is string => Boolean(x));
  const assetRows = assetRefs.length > 0
    ? await db
        .select({ id: attachments.id, url: attachments.url, name: attachments.name, kind: attachments.kind })
        .from(attachments)
        .where(and(eq(attachments.orderId, id), inArray(attachments.id, assetRefs), isNull(attachments.deletedAt)))
    : [];
  const placedAssets = assetRows.filter((a) => assetRefs.includes(a.id));
  const fabricProfiles = await listFabricVisualProfiles();
  // Bundle composition: conjuntos render their real component garments.
  const componentMap = await loadBundleComponentDescriptors(lines.map((l) => l.productId));

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Link href={`/admin/pedidos/${id}`} className="text-on-surface-variant hover:text-primary"><ArrowLeft className="w-5 h-5" /></Link>
            Diseño · Pedido #{order.number}
          </span>
        }
        subtitle={`${line.productName} ×${line.quantity}`}
      />

      {lines.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {lines.map((l) => (
            <Link
              key={l.id}
              href={`/admin/pedidos/${id}/diseno?line=${encodeURIComponent(l.id)}`}
              className={`label-caps inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs transition-colors ${
                l.id === line.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
              }`}
            >
              {l.productName}
              {l.designRevisionId ? <Badge tone="success">con diseño</Badge> : null}
            </Link>
          ))}
        </div>
      )}

      <OrderDesignEditor
        orderId={order.id}
        orderLineId={line.id}
        orderNumber={order.number}
        product={{
          id: line.productId,
          name: line.productName,
          sku: line.productSku,
          garmentFamily: line.garmentFamily,
          garmentType: line.garmentType,
          productType: line.productType,
          productKind: line.productKind,
          zones: line.zones,
          components: componentMap.get(line.productId) ?? [],
        }}
        fabrics={fabricProfiles}
        initialConfig={currentConfig}
        initialAssets={placedAssets}
        currentRevisionNo={item?.currentRevisionNo ?? 0}
        revisions={revisions.map((r) => ({
          id: r.id,
          revisionNo: r.revisionNo,
          source: revisionSourceLabel[r.source] ?? r.source,
          note: r.note,
          createdAt: r.createdAt.toISOString(),
        }))}
        renders={renderRows.map((r) => ({
          id: r.id,
          revisionNo: revisionNoById.get(r.revisionId) ?? null,
          view: r.view,
          createdAt: r.createdAt.toISOString(),
          url: r.url,
        }))}
      />
    </>
  );
}
