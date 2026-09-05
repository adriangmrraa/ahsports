import Link from "next/link";
import { db } from "@/db/client";
import { orders, organizations, payments } from "@/db/schema";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { paymentKindSchema, paymentMethodSchema } from "@/lib/validators";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Badge, Card, PageHeader } from "@/components/ui/Card";

export const metadata = { title: "Pagos · AH Sports" };

const KIND_LABEL: Record<string, string> = { sena: "Seña", pago: "Pago", saldo: "Saldo" };
const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cheque: "Cheque",
  mercadopago: "Mercado Pago",
  otro: "Otro",
};

/**
 * F5-03 — /admin/pagos: listado global con filtros + totales.
 * Los pagos cancelados se excluyen del total por defecto.
 */
export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; method?: string; dateFrom?: string; dateTo?: string; includeCancelled?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;

  const kind = paymentKindSchema.safeParse(sp.kind).success ? sp.kind! : undefined;
  const method = paymentMethodSchema.safeParse(sp.method).success ? sp.method! : undefined;
  const dateFrom = sp.dateFrom ? new Date(`${sp.dateFrom}T00:00:00`) : undefined;
  const dateTo = sp.dateTo ? new Date(`${sp.dateTo}T23:59:59.999`) : undefined;
  const includeCancelled = sp.includeCancelled === "1";

  const conds = [];
  if (kind) conds.push(eq(payments.kind, kind as never));
  if (method) conds.push(eq(payments.method, method as never));
  if (dateFrom && !Number.isNaN(dateFrom.getTime())) conds.push(gte(payments.date, dateFrom));
  if (dateTo && !Number.isNaN(dateTo.getTime())) conds.push(lte(payments.date, dateTo));
  if (!includeCancelled) conds.push(eq(payments.cancelled, false));

  const rows = await db
    .select()
    .from(payments)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(payments.date))
    .limit(200);

  const orderIds = [...new Set(rows.map((r) => r.orderId))];
  const ordersMap = orderIds.length
    ? await db
        .select({ id: orders.id, number: orders.number, organizationId: orders.organizationId })
        .from(orders)
        .where(inArray(orders.id, orderIds))
    : [];
  const orderNumber = new Map(ordersMap.map((o) => [o.id, o.number]));
  const orgIds = [...new Set(ordersMap.map((o) => o.organizationId).filter((v): v is string => !!v))];
  const orgsMap = orgIds.length
    ? await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(inArray(organizations.id, orgIds))
    : [];
  const orgName = new Map(orgsMap.map((o) => [o.id, o.name]));

  let totalCents = 0;
  for (const r of rows) {
    if (r.cancelled) continue;
    const [whole, frac = "0"] = r.amount.split(".");
    totalCents += Number(whole) * 100 + Number(frac.padEnd(2, "0").slice(0, 2));
  }

  const inputClass = "rounded-lg border border-outline-variant bg-surface-container px-3 py-1.5 text-sm";

  return (
    <div className="p-6">
      <PageHeader title="Pagos" subtitle={`Total filtrado (activos): ${formatCurrency(String(totalCents / 100))}`} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <select name="kind" className={inputClass} defaultValue={kind ?? ""}>
          <option value="">Todos los tipos</option>
          {Object.entries(KIND_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select name="method" className={inputClass} defaultValue={method ?? ""}>
          <option value="">Todos los medios</option>
          {Object.entries(METHOD_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <label className="flex flex-col gap-1 text-xs text-on-surface-variant">
          Desde
          <input type="date" name="dateFrom" defaultValue={sp.dateFrom ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-on-surface-variant">
          Hasta
          <input type="date" name="dateTo" defaultValue={sp.dateTo ?? ""} className={inputClass} />
        </label>
        <label className="flex items-center gap-2 text-sm text-on-surface-variant">
          <input type="checkbox" name="includeCancelled" value="1" defaultChecked={includeCancelled} className="w-4 h-4" />
          Incluir cancelados
        </label>
        <button type="submit" className="rounded-lg bg-surface-container-high px-4 py-1.5 text-sm">
          Filtrar
        </button>
      </form>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-outline-variant text-left text-on-surface-variant">
              <tr>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Pedido</th>
                <th className="px-3 py-2 font-medium">Organización</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Medio</th>
                <th className="px-3 py-2 font-medium text-right">Monto</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-outline-variant/50 last:border-0">
                  <td className="px-3 py-2 text-on-surface-variant">{formatDateTime(p.date)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/pedidos/${p.orderId}/pagos`} className="text-primary hover:underline">
                      #{orderNumber.get(p.orderId) ?? "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{orgName.get(ordersMap.find((o) => o.id === p.orderId)?.organizationId ?? "") ?? "—"}</td>
                  <td className="px-3 py-2"><Badge>{KIND_LABEL[p.kind] ?? p.kind}</Badge></td>
                  <td className="px-3 py-2">{METHOD_LABEL[p.method] ?? p.method}</td>
                  <td className={`px-3 py-2 text-right font-medium ${p.cancelled ? "line-through text-on-surface-variant" : ""}`}>
                    {formatCurrency(p.amount)}
                  </td>
                  <td className="px-3 py-2">
                    {p.cancelled ? <Badge tone="muted">Cancelado</Badge> : <Badge tone="success">Activo</Badge>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-on-surface-variant">Sin pagos con esos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
