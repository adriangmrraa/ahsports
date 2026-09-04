import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { orderLines, orders, pricingRules, products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader, Card, Badge } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { quoteOrder } from "@/lib/pricing";
import { AlertTriangle, ArrowLeft, Settings } from "lucide-react";
import { ConfirmQuoteForm, ReQuoteForm } from "./QuoteActions";

const CLOSED_STATUS = ["entregado", "cancelado"] as const;

export default async function CotizarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) notFound();

  // KI-06: sin regla activa no se puede cotizar → CTA a configuración.
  const [activeRule] = await db
    .select()
    .from(pricingRules)
    .where(eq(pricingRules.active, true))
    .limit(1);

  if (!activeRule) {
    return (
      <>
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <Link href={`/admin/pedidos/${order.id}`} className="text-on-surface-variant hover:text-primary">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              Pedido #{order.number} — Cotizar
            </span>
          }
          subtitle="Vista previa sin guardar"
        />
        <Card title="Sin regla de pricing activa">
          <p className="text-sm text-on-surface-variant mb-4">
            No hay ninguna regla de pricing activa. Configurá la regla &ldquo;Estándar 2026&rdquo; (margen,
            recargo urgente y seña mínima) para poder cotizar.
          </p>
          <LinkButton href="/admin/configuracion" variant="primary" size="sm">
            <span className="inline-flex items-center gap-2">
              <Settings className="w-4 h-4" /> Ir a configuración
            </span>
          </LinkButton>
        </Card>
      </>
    );
  }

  const dbLines = await db
    .select({
      id: orderLines.id,
      quantity: orderLines.quantity,
      techniqueId: orderLines.techniqueId,
      productId: orderLines.productId,
      productName: products.name,
      productSku: products.sku,
    })
    .from(orderLines)
    .leftJoin(products, eq(orderLines.productId, products.id))
    .where(eq(orderLines.orderId, id));

  if (dbLines.length === 0) {
    return (
      <>
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <Link href={`/admin/pedidos/${order.id}`} className="text-on-surface-variant hover:text-primary">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              Pedido #{order.number} — Cotizar
            </span>
          }
          subtitle="Vista previa sin guardar"
        />
        <Card>
          <p className="text-sm text-on-surface-variant text-center py-6">
            El pedido no tiene líneas.{" "}
            <Link href={`/admin/pedidos/${order.id}/linea/nueva`} className="text-primary hover:underline">
              Agregá la primera
            </Link>{" "}
            para poder cotizar.
          </p>
        </Card>
      </>
    );
  }

  // Preview: quoteOrder() SIN writes — nada se persiste en esta página.
  const quote = await quoteOrder({
    lines: dbLines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      sizeId: null,
      techniqueId: l.techniqueId,
    })),
    urgent: order.urgent,
  });

  const closed = (CLOSED_STATUS as readonly string[]).includes(order.status);
  const noRecipeCount = quote.lines.filter((l) => l.materials.length === 0).length;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Link href={`/admin/pedidos/${order.id}`} className="text-on-surface-variant hover:text-primary">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            Pedido #{order.number} — Cotizar
          </span>
        }
        subtitle={`Vista previa sin guardar · Regla ${quote.rule.name}${order.urgent ? " · Urgente" : ""}`}
        action={
          !closed ? (
            <ConfirmQuoteForm orderId={order.id} />
          ) : (
            <Badge tone="muted">Pedido {order.status} — solo lectura</Badge>
          )
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card title="Total">
          <p className="text-2xl font-bold text-on-surface data-mono">{formatCurrency(quote.totals.price)}</p>
        </Card>
        <Card title="Costo estimado">
          <p className="text-2xl font-bold text-on-surface data-mono">{formatCurrency(quote.totals.cost)}</p>
        </Card>
        <Card title="Margen">
          <p className="text-2xl font-bold text-on-surface data-mono">{formatPercent(quote.totals.marginPercent)}</p>
          <p className="text-xs text-on-surface-variant mt-1">{formatCurrency(quote.totals.margin)} sobre el total</p>
        </Card>
        <Card title="Seña mínima">
          <p className="text-2xl font-bold text-on-surface data-mono">
            {formatCurrency((quote.totals.price * quote.rule.minAdvancePercent) / 100)}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">{quote.rule.minAdvancePercent}% del total</p>
        </Card>
      </div>

      <Card
        title="Líneas cotizadas"
        className="mb-6"
        action={
          <span className="text-xs text-on-surface-variant">
            {dbLines.length} líneas · {quote.lines.reduce((acc, l) => acc + l.quantity, 0)} prendas
          </span>
        }
      >
        <Table>
          <THead>
            <tr>
              <TH>Producto</TH>
              <TH align="center">Cant.</TH>
              <TH align="right">Costo unit.</TH>
              <TH align="right">Precio unit.</TH>
              <TH align="right">Subtotal</TH>
              <TH>Materiales</TH>
            </tr>
          </THead>
          <tbody>
            {quote.lines.map((l, i) => {
              // KI-05: pricing.ts advierte por consola cuando recipes.length===0
              // (costo=0); aquí se refleja en UI como warning amarillo.
              const withoutRecipe = l.materials.length === 0;
              const sku = dbLines[i]?.productSku;
              return (
                <TR key={`${l.productId}-${i}`}>
                  <TD>
                    <div className="text-on-surface">{l.productName}</div>
                    {sku && <div className="text-xs text-on-surface-variant data-mono">{sku}</div>}
                    {withoutRecipe && (
                      <p className="mt-1 inline-flex items-start gap-1 text-xs text-warning bg-warning/10 rounded px-2 py-1">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        Sin receta configurada — costo estimado en 0. Verificar BOM en /admin/recetas.
                      </p>
                    )}
                  </TD>
                  <TD align="center">{l.quantity}</TD>
                  <TD align="right">{formatCurrency(l.unitCost)}</TD>
                  <TD align="right">{formatCurrency(l.unitPrice)}</TD>
                  <TD align="right" className="text-on-surface font-bold">
                    {formatCurrency(l.subtotal)}
                  </TD>
                  <TD>
                    {l.materials.length === 0 ? (
                      <span className="text-xs text-on-surface-variant">—</span>
                    ) : (
                      <ul className="text-xs text-on-surface-variant space-y-0.5">
                        {l.materials.map((m) => (
                          <li key={m.name} className="data-mono">
                            {m.name} · {m.totalQuantity} {m.unit}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
        {noRecipeCount > 0 && (
          <p className="mt-3 text-xs text-on-surface-variant">
            {noRecipeCount} línea(s) sin receta: el costo puede estar subestimado. Confirmar igual guarda
            unitPrice/unitCost recalculados en el servidor.
          </p>
        )}
      </Card>

      {!closed && (
        <Card title="Re-cotizar" className="mb-6">
          <p className="text-sm text-on-surface-variant mb-3">
            Recalcula con o sin recargo urgente. Guarda nuevo snapshot en historial sin cambiar el estado del
            pedido.
          </p>
          <ReQuoteForm orderId={order.id} currentUrgent={order.urgent} />
        </Card>
      )}

      <p className="text-xs text-on-surface-variant text-center">
        Vista previa — nada se guarda hasta confirmar. La confirmación recalcula en el servidor e ignora estos
        valores.
      </p>
    </>
  );
}
