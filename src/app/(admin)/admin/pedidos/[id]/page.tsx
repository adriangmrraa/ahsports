import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { orders, orderLines, orderItems, payments, products, organizations, contacts, attachments, productionEvents } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader, Card, Badge } from "@/components/ui/Card";
import { LinkButton, Button } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { formatPercent } from "@/lib/utils";
import { ArrowLeft, Lock } from "lucide-react";
import type { ReactNode } from "react";

const statusLabel: Record<string, string> = {
  borrador: "Borrador",
  presupuesto_enviado: "Presupuesto enviado",
  aprobado: "Aprobado",
  seniado: "Señado",
  en_produccion: "En producción",
  corte: "Corte",
  confeccion: "Confección",
  estampado: "Estampado",
  control: "Control",
  entregado: "Entregado",
  cancelado: "Cancelado",
  bloqueado_pago: "Bloqueado (pago)",
};

const stageLabel: Record<string, string> = {
  ingreso: "Ingreso",
  corte: "Corte",
  confeccion: "Confección",
  estampado: "Estampado",
  control: "Control",
  entrega: "Entrega",
};

function Soon({ children }: { children: ReactNode }) {
  return (
    <span title="Próximamente" className="inline-flex flex-1">
      <Button size="sm" variant="secondary" disabled className="flex-1">
        {children}
      </Button>
    </span>
  );
}

export default async function PedidoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) notFound();

  const [org] = order.organizationId ? await db.select().from(organizations).where(eq(organizations.id, order.organizationId)).limit(1) : [];
  const [contact] = order.contactId ? await db.select().from(contacts).where(eq(contacts.id, order.contactId)).limit(1) : [];

  const lines = await db
    .select({
      id: orderLines.id,
      quantity: orderLines.quantity,
      unitPrice: orderLines.unitPrice,
      unitCost: orderLines.unitCost,
      productId: orderLines.productId,
      productName: products.name,
      productSku: products.sku,
    })
    .from(orderLines)
    .leftJoin(products, eq(orderLines.productId, products.id))
    .where(eq(orderLines.orderId, id));

  // KI-03: items filtrados por orderId vía join con orderLines (nunca fetch global).
  const items = await db
    .select({ item: orderItems })
    .from(orderItems)
    .innerJoin(orderLines, eq(orderItems.orderLineId, orderLines.id))
    .where(eq(orderLines.orderId, id));
  const itemsByLine = new Map<string, typeof orderItems.$inferSelect[]>();
  for (const { item } of items) {
    const arr = itemsByLine.get(item.orderLineId) ?? [];
    arr.push(item);
    itemsByLine.set(item.orderLineId, arr);
  }

  const pays = await db.select().from(payments).where(eq(payments.orderId, id)).orderBy(desc(payments.date));
  const totalPagado = pays.reduce((acc, p) => acc + Number(p.amount), 0);
  const saldo = Number(order.totalQuoted) - totalPagado;
  const snapshotRule = (order.snapshot as { rule?: { minAdvancePercent: number } } | null)?.rule;
  const minSena = snapshotRule
    ? (Number(order.totalQuoted) * Number(snapshotRule.minAdvancePercent)) / 100
    : Number(order.totalQuoted) * 0.5;
  const faltaSena = Math.max(0, minSena - totalPagado);
  const bloqueado = order.status === "bloqueado_pago";

  const atts = await db.select().from(attachments).where(eq(attachments.orderId, id)).orderBy(desc(attachments.createdAt));
  const events = await db.select().from(productionEvents).where(eq(productionEvents.orderId, id)).orderBy(desc(productionEvents.createdAt)).limit(10);

  const statusTone =
    order.status === "bloqueado_pago" ? "error" :
    order.status === "presupuesto_enviado" ? "tertiary" :
    ["aprobado", "seniado", "en_produccion", "corte", "confeccion", "estampado"].includes(order.status) ? "primary" :
    order.status === "entregado" ? "success" :
    "muted";

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Link href="/admin/pedidos" className="text-on-surface-variant hover:text-primary"><ArrowLeft className="w-5 h-5" /></Link>
            Pedido #{order.number}
          </span>
        }
        subtitle={org ? `${org.name}${contact ? ` · ${contact.name}` : ""}` : "Particular"}
        action={
          <>
            <Soon>Vista cliente</Soon>
            <LinkButton href={`/admin/pedidos/${order.id}/planilla`} variant="secondary" size="sm">
              Planilla
            </LinkButton>
            <Soon>Arte</Soon>
            <LinkButton href={`/admin/pedidos/${order.id}/ficha-tecnica`} variant="secondary" size="sm">
              Ficha técnica
            </LinkButton>
          </>
        }
      />

      {bloqueado && (
        <div className="glass-panel rounded-lg p-4 mb-6 border-l-4 border-l-error flex items-start gap-3">
          <Lock className="w-5 h-5 text-error mt-0.5" />
          <div>
            <p className="label-caps text-error">Pedido bloqueado</p>
            <p className="text-sm text-on-surface-variant">Faltan {formatCurrency(faltaSena)} para cubrir la seña mínima ({formatCurrency(minSena)}). No inicia producción hasta regularizar.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card title="Estado" className="lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <Badge tone={statusTone as never}>{statusLabel[order.status]}</Badge>
            {order.urgent && <Badge tone="error">Urgente</Badge>}
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-on-surface-variant">Total cotizado</dt><dd className="text-on-surface font-bold">{formatCurrency(order.totalQuoted)}</dd></div>
            <div className="flex justify-between"><dt className="text-on-surface-variant">Costo estimado</dt><dd>{formatCurrency(order.totalCost)}</dd></div>
            <div className="flex justify-between"><dt className="text-on-surface-variant">Margen</dt><dd>{formatPercent(order.marginPercent)}</dd></div>
            <div className="flex justify-between"><dt className="text-on-surface-variant">Pagado</dt><dd>{formatCurrency(totalPagado)}</dd></div>
            <div className="flex justify-between"><dt className="text-on-surface-variant">Saldo</dt><dd className={saldo > 0 ? "text-secondary" : "text-success"}>{formatCurrency(saldo)}</dd></div>
          </dl>
          <div className="flex gap-2 mt-4 pt-4 border-t border-outline-variant">
            <LinkButton href={`/admin/pedidos/${order.id}/cotizar`} variant="primary" size="sm">
              Cotizar
            </LinkButton>
            <Soon>Pago</Soon>
          </div>
        </Card>

        <Card title="Cliente" className="lg:col-span-2">
          {org ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-on-surface-variant">Organización</span><Link href={`/admin/organizaciones/${org.id}`} className="text-primary hover:underline">{org.name}</Link></div>
              <div className="flex justify-between"><span className="text-on-surface-variant">Tipo</span><span>{org.kind}</span></div>
              {contact && <div className="flex justify-between"><span className="text-on-surface-variant">Contacto</span><span>{contact.name} {contact.phone ? `· ${contact.phone}` : ""}</span></div>}
              {contact?.email && <div className="flex justify-between"><span className="text-on-surface-variant">Email</span><span className="data-mono">{contact.email}</span></div>}
              {order.notes && (
                <div className="pt-3 border-t border-outline-variant mt-3">
                  <p className="label-caps text-on-surface-variant mb-1">Notas del pedido</p>
                  <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">
              Particular.{" "}
              <span title="Próximamente" className="text-on-surface-variant underline decoration-dotted cursor-not-allowed">
                Asignar organización
              </span>
            </p>
          )}
        </Card>
      </div>

      <Card title="Líneas del pedido" className="mb-6" action={<LinkButton href={`/admin/pedidos/${order.id}/linea/nueva`} variant="secondary" size="sm">Agregar línea</LinkButton>}>
        {lines.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-6">Sin líneas. Agregá la primera para poder cotizar.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Producto</TH>
                <TH align="center">Cantidad</TH>
                <TH align="right">Costo unit.</TH>
                <TH align="right">Precio unit.</TH>
                <TH align="right">Subtotal</TH>
                <TH>Planilla</TH>
              </tr>
            </THead>
            <tbody>
              {lines.map((l) => {
                const its = itemsByLine.get(l.id) ?? [];
                return (
                  <TR key={l.id}>
                    <TD>
                      <div className="text-on-surface">{l.productName ?? l.productId}</div>
                      <div className="text-xs text-on-surface-variant data-mono">{l.productSku}</div>
                    </TD>
                    <TD align="center">{l.quantity}</TD>
                    <TD align="right">{formatCurrency(l.unitCost)}</TD>
                    <TD align="right">{formatCurrency(l.unitPrice)}</TD>
                    <TD align="right" className="text-on-surface font-bold">{formatCurrency(Number(l.unitPrice) * l.quantity)}</TD>
                    <TD>
                      <span className="data-mono text-on-surface-variant">{its.length} prendas</span>{" "}
                      <Link href={`/admin/pedidos/${order.id}/planilla`} className="text-[11px] label-caps text-primary hover:underline">
                        Ver
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Pagos">
          {pays.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-4">Sin pagos registrados.</p>
          ) : (
            <div className="space-y-2">
              {pays.map((p) => (
                <div key={p.id} className="flex justify-between items-center p-2 rounded bg-surface-container-low">
                  <div>
                    <p className="text-sm text-on-surface">{p.kind} · {p.method}</p>
                    <p className="text-xs text-on-surface-variant">{formatDateTime(p.date)}</p>
                  </div>
                  <span className="data-mono text-success">{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Adjuntos">
          {atts.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-4">
              Sin adjuntos.{" "}
              <span title="Próximamente" className="underline decoration-dotted cursor-not-allowed">
                Arte & adjuntos
              </span>
              .
            </p>
          ) : (
            <div className="space-y-1">
              {atts.map((a) => (
                <div key={a.id} className="flex justify-between items-center text-sm p-2 rounded hover:bg-surface-bright/5">
                  <span className="text-on-surface truncate">{a.name}</span>
                  <Badge tone={a.status === "aprobado" ? "success" : a.status === "rechazado" ? "error" : "muted"}>{a.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {events.length > 0 && (
        <Card title="Historial de producción" className="mt-6">
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="flex justify-between items-center text-sm py-1 border-b border-outline-variant/50 last:border-0">
                <span className="text-on-surface">Etapa: <span className="label-caps text-primary">{stageLabel[e.stage] ?? e.stage}</span></span>
                <span className="data-mono text-on-surface-variant">{formatDateTime(e.createdAt)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
