import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import {
  applications,
  attachments,
  bomItems,
  bomRecipes,
  materials,
  orderItems,
  orderLines,
  orders,
  organizations,
  products,
  sizes,
  techniques,
} from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui/Card";
import type { PricingSnapshot } from "@/db/schema";
import { calculateBomConsumption, consumptionUnit } from "@/lib/consumption";

export default async function FichaTecnicaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) notFound();

  const [org] = order.organizationId
    ? await db.select().from(organizations).where(eq(organizations.id, order.organizationId)).limit(1)
    : [];

  const lines = await db
    .select({
      id: orderLines.id,
      quantity: orderLines.quantity,
      techniqueId: orderLines.techniqueId,
      productId: orderLines.productId,
      productName: products.name,
      productSku: products.sku,
      techniqueName: techniques.name,
    })
    .from(orderLines)
    .leftJoin(products, eq(orderLines.productId, products.id))
    .leftJoin(techniques, eq(orderLines.techniqueId, techniques.id))
    .where(eq(orderLines.orderId, id));

  const items = lines.length > 0
    ? await db
        .select({ item: orderItems, sizeLabel: sizes.label })
        .from(orderItems)
        .innerJoin(orderLines, eq(orderItems.orderLineId, orderLines.id))
        .leftJoin(sizes, eq(orderItems.sizeId, sizes.id))
        .where(eq(orderLines.orderId, id))
    : [];
  const itemsByLine = new Map<string, Array<{ status: string; sizeId: string | null; sizeLabel: string | null; name: string | null; number: string | null }>>();
  for (const { item, sizeLabel } of items) {
    const arr = itemsByLine.get(item.orderLineId) ?? [];
    arr.push({ status: item.status, sizeId: item.sizeId, sizeLabel, name: item.individualName, number: item.individualNumber });
    itemsByLine.set(item.orderLineId, arr);
  }

  // Materiales: del snapshot vigente si existe; si no, receta más específica por producto.
  type Mat = { name: string; totalQuantity: number; unit: string };
  let materialSource: "snapshot" | "receta" = "receta";
  let mats: Mat[] = [];
  const snapshot = order.snapshot as PricingSnapshot | null;
  if (snapshot?.lines?.length) {
    materialSource = "snapshot";
    const agg = new Map<string, Mat>();
    for (const l of snapshot.lines) {
      for (const m of l.materials ?? []) {
        const prev = agg.get(m.name);
        if (prev) prev.totalQuantity += m.totalQuantity;
        else agg.set(m.name, { ...m });
      }
    }
    mats = Array.from(agg.values());
  } else if (lines.length > 0) {
    const productIds = [...new Set(lines.map((l) => l.productId))];
    const recipes = await db.select().from(bomRecipes).where(inArray(bomRecipes.productId, productIds)).limit(100);
    const agg = new Map<string, Mat>();
    for (const line of lines) {
      const candidates = recipes.filter((r) => r.productId === line.productId);
      const lineItems = itemsByLine.get(line.id) ?? [];
      const sizeGroups = new Map<string | null, number>();
      for (const item of lineItems) {
        const sizeId = item.sizeId;
        sizeGroups.set(sizeId, (sizeGroups.get(sizeId) ?? 0) + 1);
      }
      if (sizeGroups.size === 0) sizeGroups.set(null, line.quantity);
      for (const [sizeId, sizeQuantity] of sizeGroups) {
        const recipe = candidates.find((r) => r.sizeId === sizeId && r.techniqueId === line.techniqueId)
          ?? candidates.find((r) => r.sizeId === sizeId)
          ?? candidates.find((r) => r.sizeId === null && r.techniqueId === line.techniqueId)
          ?? candidates.find((r) => r.sizeId === null && r.techniqueId === null);
        if (!recipe) continue;
        const rItems = await db.select().from(bomItems).where(eq(bomItems.recipeId, recipe.id));
        for (const ri of rItems) {
          const [mat] = await db.select().from(materials).where(eq(materials.id, ri.materialId)).limit(1);
          if (!mat) continue;
          const calculated = calculateBomConsumption({
            mode: ri.consumptionMode,
            directQuantity: ri.directQuantity,
            unitsPerConsumptionUnit: ri.unitsPerConsumptionUnit,
            legacyQuantity: ri.quantity,
            wastePercent: ri.wastePercent,
            materialName: mat.name,
          });
          const prev = agg.get(mat.id);
          const add = calculated.calculatedQuantityPerUnit * sizeQuantity;
          if (prev) prev.totalQuantity += add;
          else agg.set(mat.id, { name: mat.name, totalQuantity: Math.round(add * 1000) / 1000, unit: consumptionUnit(mat.unit) });
        }
      }
    }
    mats = Array.from(agg.values());
  }

  // Aplicaciones del pedido (diseños a aplicar por zona/vista/técnica).
  const atts = await db.select().from(attachments).where(eq(attachments.orderId, id)).orderBy(desc(attachments.createdAt)).limit(50);
  const apps = atts.length > 0
    ? await db
        .select({
          zone: applications.zone,
          view: applications.view,
          techniqueName: techniques.name,
          attachmentName: attachments.name,
        })
        .from(applications)
        .innerJoin(attachments, eq(applications.attachmentId, attachments.id))
        .leftJoin(techniques, eq(applications.techniqueId, techniques.id))
        .where(inArray(applications.attachmentId, atts.map((a) => a.id)))
    : [];

  const totalPrendas = items.length;

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title={`Pedido #${order.number} — Ficha técnica`}
        subtitle={org ? org.name : "Particular"}
        action={
          <Link href={`/admin/pedidos/${id}`} className="text-xs label-caps text-primary hover:underline">
            ← Ficha
          </Link>
        }
      />

      {/* Resumen */}
      <Card title="Resumen" className="mb-4">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-on-surface-variant">Estado</dt>
            <dd><Badge tone="muted">{order.status}</Badge></dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-on-surface-variant">Líneas</dt>
            <dd className="text-on-surface font-bold">{lines.length}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-on-surface-variant">Prendas</dt>
            <dd className="text-on-surface font-bold">{totalPrendas}</dd>
          </div>
          {order.urgent && (
            <div className="flex justify-between gap-2">
              <dt className="text-on-surface-variant">Prioridad</dt>
              <dd><Badge tone="error">Urgente</Badge></dd>
            </div>
          )}
          {order.notes && (
            <div className="pt-2 border-t border-outline-variant">
              <dt className="label-caps text-on-surface-variant mb-1">Notas</dt>
              <dd className="whitespace-pre-wrap">{order.notes}</dd>
            </div>
          )}
        </dl>
      </Card>

      {lines.length === 0 ? (
        <EmptyState title="Sin líneas aún" description="Todavía no hay productos en este pedido." />
      ) : (
        <>
          {/* Planilla resumida — cards verticales, sin scroll horizontal */}
          <Card title="Planilla" className="mb-4">
            <div className="space-y-3">
              {lines.map((l) => {
                const its = itemsByLine.get(l.id) ?? [];
                const bySize = new Map<string, number>();
                for (const it of its) bySize.set(it.sizeLabel ?? "U", (bySize.get(it.sizeLabel ?? "U") ?? 0) + 1);
                return (
                  <div key={l.id} className="rounded-md border border-outline-variant p-3">
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <div>
                        <p className="text-sm text-on-surface font-bold">{l.productName}</p>
                        <p className="text-xs text-on-surface-variant data-mono">{l.productSku}</p>
                      </div>
                      <Badge tone="primary">{l.quantity} u.</Badge>
                    </div>
                    {l.techniqueName && <p className="text-xs text-on-surface-variant mb-1">Técnica: {l.techniqueName}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Array.from(bySize.entries()).map(([size, qty]) => (
                        <Badge key={size} tone="muted">{size} × {qty}</Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Materiales a consumir */}
          <Card
            title={`Materiales a consumir`}
            className="mb-4"
            action={<Badge tone="muted">{materialSource === "snapshot" ? "Cotización" : "Receta"}</Badge>}
          >
            {mats.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-4">
                Sin recetas configuradas para estos productos. Verificar BOM.
              </p>
            ) : (
              <ul className="space-y-2">
                {mats.map((m) => (
                  <li key={m.name} className="flex justify-between items-center gap-2 text-sm py-1 border-b border-outline-variant/50 last:border-0">
                    <span className="text-on-surface">{m.name}</span>
                    <span className="data-mono text-on-surface-variant whitespace-nowrap">{m.totalQuantity} {m.unit}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Aplicaciones */}
          <Card title="Aplicaciones">
            {apps.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-4">Sin aplicaciones registradas.</p>
            ) : (
              <ul className="space-y-2">
                {apps.map((a, i) => (
                  <li key={i} className="rounded-md border border-outline-variant p-3 text-sm">
                    <p className="text-on-surface font-bold">{a.zone} · {a.view}</p>
                    <p className="text-xs text-on-surface-variant">
                      {a.techniqueName ? `Técnica: ${a.techniqueName} · ` : ""}Diseño: {a.attachmentName}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
