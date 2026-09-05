import Link from "next/link";
import { db } from "@/db/client";
import { orders, organizations, payments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fromCents, toCents } from "@/lib/payments";
import { formatCurrency } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui/Card";

export const metadata = { title: "Caja · AH Sports" };

/**
 * F5-01 — /admin/caja: saldos por organización.
 * Cotizado = suma orders.totalQuoted · Pagado = suma pagos activos.
 * Deudores primero (saldo descendente).
 */
export default async function CajaPage() {
  await requireUser();

  const [orgs, orderRows, paymentRows] = await Promise.all([
    db.select({ id: organizations.id, name: organizations.name }).from(organizations),
    db.select({ id: orders.id, organizationId: orders.organizationId, totalQuoted: orders.totalQuoted }).from(orders),
    db.select({ orderId: payments.orderId, amount: payments.amount, cancelled: payments.cancelled }).from(payments),
  ]);

  const orderOrg = new Map<string, string>();
  const quotedByOrg = new Map<string, number>();
  for (const o of orderRows) {
    if (!o.organizationId) continue;
    orderOrg.set(o.id, o.organizationId);
    quotedByOrg.set(o.organizationId, (quotedByOrg.get(o.organizationId) ?? 0) + toCents(o.totalQuoted));
  }
  const paidByOrg = new Map<string, number>();
  for (const p of paymentRows) {
    if (p.cancelled) continue;
    const orgId = orderOrg.get(p.orderId);
    if (!orgId) continue;
    paidByOrg.set(orgId, (paidByOrg.get(orgId) ?? 0) + toCents(p.amount));
  }

  const rows = orgs
    .map((org) => {
      const quoted = quotedByOrg.get(org.id) ?? 0;
      const paid = paidByOrg.get(org.id) ?? 0;
      return { ...org, quoted, paid, balance: quoted - paid };
    })
    .sort((a, b) => b.balance - a.balance);

  return (
    <div className="p-6">
      <PageHeader title="Caja" subtitle="Saldos por organización · deudores primero" />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-outline-variant text-left text-on-surface-variant">
              <tr>
                <th className="px-3 py-2 font-medium">Organización</th>
                <th className="px-3 py-2 font-medium text-right">Cotizado</th>
                <th className="px-3 py-2 font-medium text-right">Pagado</th>
                <th className="px-3 py-2 font-medium text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-outline-variant/50 last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/admin/caja/${r.id}`} className="text-primary hover:underline font-medium">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(fromCents(r.quoted))}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(fromCents(r.paid))}</td>
                  <td className={`px-3 py-2 text-right font-medium ${r.balance > 0 ? "text-error" : "text-success"}`}>
                    {formatCurrency(fromCents(r.balance))}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-on-surface-variant">Sin organizaciones.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
