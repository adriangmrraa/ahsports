import Link from "next/link";
import { db } from "@/db/client";
import { orders, contacts, organizations } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHeader, Card, Badge } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";
import { Plus, Search } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function PedidosPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const filterStatus = sp.status;
  const q = sp.q?.trim().toLowerCase() || undefined;

  const rows = await db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      totalQuoted: orders.totalQuoted,
      createdAt: orders.createdAt,
      publicToken: orders.publicToken,
      orgName: organizations.name,
      contactName: contacts.name,
    })
    .from(orders)
    .leftJoin(organizations, eq(orders.organizationId, organizations.id))
    .leftJoin(contacts, eq(orders.contactId, contacts.id))
    .orderBy(desc(orders.createdAt))
    .limit(200);

  const filtered = rows.filter((r) => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (q) {
      const hay = `#${r.number} ${r.orgName ?? ""} ${r.contactName ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

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

  return (
    <>
      <PageHeader
        title="Pedidos"
        subtitle={filterStatus ? `Filtrado: ${statusLabel[filterStatus] ?? filterStatus}` : `${rows.length} pedidos en el sistema`}
        action={
          <LinkButton href="/admin/pedidos/nuevo">
            <Plus className="w-4 h-4" /> Nuevo pedido
          </LinkButton>
        }
      />

      <form method="get" className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por n°, cliente o contacto..." className="pl-9" />
        </div>
        {filterStatus && <input type="hidden" name="status" value={filterStatus} />}
        <button
          type="submit"
          className="rounded-md font-label-caps text-sm px-4 py-2 bg-surface-container-high text-on-surface border border-outline-variant hover:border-primary transition-colors"
        >
          Buscar
        </button>
      </form>

      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-thin">
        <Link href={q ? `/admin/pedidos?q=${encodeURIComponent(sp.q ?? "")}` : "/admin/pedidos"} className={`label-caps px-3 py-1.5 rounded-md border transition-colors ${!filterStatus ? "border-primary text-primary bg-primary/10" : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"}`}>
          Todos
        </Link>
        {Object.entries(statusLabel).map(([k, v]) => {
          const href = q ? `/admin/pedidos?status=${k}&q=${encodeURIComponent(sp.q ?? "")}` : `/admin/pedidos?status=${k}`;
          return (
            <Link key={k} href={href} className={`label-caps px-3 py-1.5 rounded-md border transition-colors whitespace-nowrap ${filterStatus === k ? "border-primary text-primary bg-primary/10" : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"}`}>
              {v}
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <p className="label-caps text-primary mb-2">Sin pedidos</p>
            <p className="text-sm text-on-surface-variant mb-4">Cuando se creen pedidos aparecerán acá.</p>
            <LinkButton href="/admin/pedidos/nuevo">Crear el primero</LinkButton>
          </div>
        </Card>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>#</TH>
              <TH>Cliente / Organización</TH>
              <TH>Estado</TH>
              <TH align="right">Total</TH>
              <TH>Fecha</TH>
              <TH align="right">Acciones</TH>
            </tr>
          </THead>
          <tbody>
            {filtered.map((o) => {
              const tone =
                o.status === "bloqueado_pago" ? "error" :
                o.status === "presupuesto_enviado" ? "tertiary" :
                ["aprobado", "seniado", "en_produccion", "corte", "confeccion", "estampado"].includes(o.status) ? "primary" :
                o.status === "entregado" ? "success" :
                "muted";
              return (
                <TR key={o.id}>
                  <TD className="text-primary">#{o.number}</TD>
                  <TD>
                    <div className="text-on-surface">{o.orgName ?? "Particular"}</div>
                    {o.contactName && <div className="text-xs text-on-surface-variant">{o.contactName}</div>}
                  </TD>
                  <TD><Badge tone={tone as never}>{statusLabel[o.status]}</Badge></TD>
                  <TD align="right" className="text-on-surface">{formatCurrency(o.totalQuoted)}</TD>
                  <TD className="text-on-surface-variant">{formatDate(o.createdAt)}</TD>
                  <TD align="right">
                    <Link href={`/admin/pedidos/${o.id}`} className="text-primary hover:underline label-caps">Abrir →</Link>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}