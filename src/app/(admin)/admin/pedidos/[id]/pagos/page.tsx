import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { orders, payments, pricingRules } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { sumActivePaymentsCents, requiredAdvanceCents, toCents, fromCents } from "@/lib/payments";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui/Card";
import { CancelPaymentButton, RegisterPaymentForm } from "./PagosForms";

export const metadata = { title: "Pagos del pedido · AH Sports" };

const KIND_LABEL: Record<string, string> = { sena: "Seña", pago: "Pago", saldo: "Saldo" };
const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cheque: "Cheque",
  mercadopago: "Mercado Pago",
  otro: "Otro",
};

/**
 * F5-04 — /admin/pedidos/[id]/pagos: pagos del pedido + alta + cancelación.
 * Los cancelados se muestran tachados y NO cuentan en los totales.
 */
export default async function PedidoPagosPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) notFound();

  const rows = await db.select().from(payments).where(eq(payments.orderId, id)).orderBy(desc(payments.date)).limit(200);

  const paidCents = sumActivePaymentsCents(rows);
  const quotedCents = toCents(order.totalQuoted);
  const frozenAdvance = order.snapshot?.rule.minAdvancePercent;
  let minAdvance = "50";
  if (frozenAdvance !== undefined) {
    minAdvance = String(frozenAdvance);
  } else {
    const ruleId = order.pricingRuleId;
    if (ruleId) {
      const [rule] = await db
        .select({ minAdvancePercent: pricingRules.minAdvancePercent })
        .from(pricingRules)
        .where(eq(pricingRules.id, ruleId))
        .limit(1);
      if (rule) minAdvance = rule.minAdvancePercent;
    } else {
      const [active] = await db
        .select({ minAdvancePercent: pricingRules.minAdvancePercent })
        .from(pricingRules)
        .where(eq(pricingRules.active, true))
        .limit(1);
      if (active) minAdvance = active.minAdvancePercent;
    }
  }
  const requiredCents = requiredAdvanceCents(quotedCents, minAdvance);
  const faltaSenaCents = Math.max(0, requiredCents - paidCents);

  return (
    <div className="p-6">
      <PageHeader
        title={`Pagos · Pedido #${order.number}`}
        subtitle={`Estado: ${order.status} · Seña requerida: ${minAdvance}%`}
        action={
          <Link href={`/admin/pedidos/${order.id}`} className="text-primary hover:underline text-sm">
            ← Volver al pedido
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Cotizado" value={formatCurrency(order.totalQuoted)} />
        <StatCard label="Pagado" value={formatCurrency(fromCents(paidCents))} tone="success" />
        <StatCard label="Saldo" value={formatCurrency(fromCents(quotedCents - paidCents))} tone="warning" />
        <StatCard label="Falta seña" value={formatCurrency(fromCents(faltaSenaCents))} tone={faltaSenaCents > 0 ? "error" : "success"} />
      </div>

      <Card title="Registrar pago" className="mb-6">
        <RegisterPaymentForm orderId={order.id} />
      </Card>

      <Card title={`Pagos registrados (${rows.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-outline-variant text-left text-on-surface-variant">
              <tr>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Medio</th>
                <th className="px-3 py-2 font-medium text-right">Monto</th>
                <th className="px-3 py-2 font-medium">Referencia</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-outline-variant/50 last:border-0">
                  <td className="px-3 py-2 text-on-surface-variant">{formatDateTime(p.date)}</td>
                  <td className="px-3 py-2"><Badge>{KIND_LABEL[p.kind] ?? p.kind}</Badge></td>
                  <td className="px-3 py-2">{METHOD_LABEL[p.method] ?? p.method}</td>
                  <td className={`px-3 py-2 text-right font-medium ${p.cancelled ? "line-through text-on-surface-variant" : ""}`}>
                    {formatCurrency(p.amount)}
                  </td>
                  <td className="px-3 py-2 text-on-surface-variant">{p.reference || "—"}</td>
                  <td className="px-3 py-2">
                    {p.cancelled ? <Badge tone="muted">Cancelado</Badge> : <Badge tone="success">Activo</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!p.cancelled && <CancelPaymentButton paymentId={p.id} />}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-on-surface-variant">Sin pagos. Registrá la seña arriba.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
