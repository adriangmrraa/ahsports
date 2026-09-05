import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { orders, organizations, payments } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { fromCents, toCents } from "@/lib/payments";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui/Card";

export const metadata = { title: "Cuenta corriente · AH Sports" };

const KIND_LABEL: Record<string, string> = { sena: "Seña registrada", pago: "Pago", saldo: "Saldo" };

/**
 * F5-02 — /admin/caja/[organizationId]: cuenta corriente detallada.
 * Timeline cronológico: creación de pedidos + pagos activos.
 */
export default async function CajaDetallePage({ params }: { params: Promise<{ organizationId: string }> }) {
  await requireUser();
  const { organizationId } = await params;

  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) notFound();

  const orderRows = await db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      totalQuoted: orders.totalQuoted,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.organizationId, organizationId))
    .orderBy(desc(orders.createdAt))
    .limit(200);

  const orderIds = orderRows.map((o) => o.id);
  // Volumen del taller: se cargan los pagos y se filtran en memoria.
  const allPayments =
    orderIds.length > 0
      ? await db
          .select({
            orderId: payments.orderId,
            kind: payments.kind,
            amount: payments.amount,
            date: payments.date,
            cancelled: payments.cancelled,
          })
          .from(payments)
          .orderBy(desc(payments.date))
          .limit(1000)
      : [];
  const orgPayments = allPayments.filter((p) => orderIds.includes(p.orderId) && !p.cancelled);

  const quotedCents = orderRows.reduce((acc, o) => acc + toCents(o.totalQuoted), 0);
  const paidCents = orgPayments.reduce((acc, p) => acc + toCents(p.amount), 0);

  const orderNumber = new Map(orderRows.map((o) => [o.id, o.number]));
  type Event = { at: Date; label: string; amountCents: number | null; orderId?: string };
  const events: Event[] = [
    ...orderRows.map((o) => ({
      at: o.createdAt,
      label: `Pedido #${o.number} creado`,
      amountCents: toCents(o.totalQuoted),
      orderId: o.id as string,
    })),
    ...orgPayments.map((p) => ({
      at: p.date,
      label: `${KIND_LABEL[p.kind] ?? p.kind} · Pedido #${orderNumber.get(p.orderId) ?? "—"}`,
      amountCents: toCents(p.amount),
      orderId: p.orderId as string,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const openOrders = orderRows.filter((o) => !["entregado", "cancelado"].includes(o.status));

  return (
    <div className="p-6">
      <PageHeader
        title={`Cuenta corriente · ${org.name}`}
        subtitle="Timeline cronológico + pedidos abiertos"
        action={
          <Link href="/admin/caja" className="text-primary hover:underline text-sm">
            ← Volver a caja
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Cotizado" value={formatCurrency(fromCents(quotedCents))} />
        <StatCard label="Pagado" value={formatCurrency(fromCents(paidCents))} tone="success" />
        <StatCard label="Saldo" value={formatCurrency(fromCents(quotedCents - paidCents))} tone={quotedCents - paidCents > 0 ? "warning" : "success"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Movimientos">
          {events.length === 0 && <p className="text-sm text-on-surface-variant">Sin movimientos.</p>}
          <ul className="flex flex-col gap-3">
            {events.map((e, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 border-b border-outline-variant/50 pb-2 last:border-0">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{e.label}</span>
                  <span className="text-xs text-on-surface-variant">{formatDateTime(e.at)}</span>
                </div>
                {e.amountCents !== null && (
                  <span className="text-sm font-medium">{formatCurrency(fromCents(e.amountCents))}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card title={`Pedidos abiertos (${openOrders.length})`}>
          {openOrders.length === 0 && <p className="text-sm text-on-surface-variant">Sin pedidos abiertos.</p>}
          <ul className="flex flex-col gap-2">
            {openOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3">
                <Link href={`/admin/pedidos/${o.id}`} className="text-primary hover:underline text-sm font-medium">
                  Pedido #{o.number}
                </Link>
                <span className="flex items-center gap-2">
                  <Badge>{o.status}</Badge>
                  <span className="text-sm">{formatCurrency(o.totalQuoted)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
