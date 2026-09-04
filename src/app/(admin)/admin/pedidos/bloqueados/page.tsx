import Link from "next/link";
import { db } from "@/db/client";
import { orders, contacts, organizations } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Lock } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function PedidosBloqueadosPage() {
  const rows = await db
    .select({
      id: orders.id,
      number: orders.number,
      totalQuoted: orders.totalQuoted,
      createdAt: orders.createdAt,
      orgName: organizations.name,
      contactName: contacts.name,
    })
    .from(orders)
    .leftJoin(organizations, eq(orders.organizationId, organizations.id))
    .leftJoin(contacts, eq(orders.contactId, contacts.id))
    .where(eq(orders.status, "bloqueado_pago"))
    .orderBy(desc(orders.createdAt))
    .limit(200);

  return (
    <>
      <PageHeader
        title="Pedidos bloqueados"
        subtitle={`${rows.length} pedidos pendientes de seña`}
        action={<LinkButton href="/admin/pedidos">Ver todos</LinkButton>}
      />

      <div className="glass-panel rounded-lg p-4 mb-6 border-l-4 border-l-error flex items-start gap-3">
        <Lock className="w-5 h-5 text-error mt-0.5" />
        <div>
          <p className="label-caps text-error">Bloqueo por seña insuficiente</p>
          <p className="text-sm text-on-surface-variant">
            Estos pedidos no cubren la seña mínima y no pueden avanzar a producción
            (el cambio de etapa responde 409 hasta regularizar). Registrá la seña desde la ficha de cada pedido.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Sin bloqueos"
          description="Ningún pedido está bloqueado por pago. Cuando un pedido no cubra la seña mínima aparecerá acá."
          action={<LinkButton href="/admin/pedidos">Volver a pedidos</LinkButton>}
        />
      ) : (
        <Card>
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
              {rows.map((o) => (
                <TR key={o.id}>
                  <TD className="text-primary">#{o.number}</TD>
                  <TD>
                    <div className="text-on-surface">{o.orgName ?? "Particular"}</div>
                    {o.contactName && <div className="text-xs text-on-surface-variant">{o.contactName}</div>}
                  </TD>
                  <TD>
                    <Badge tone="error">Bloqueado (pago)</Badge>
                  </TD>
                  <TD align="right" className="text-on-surface">{formatCurrency(o.totalQuoted)}</TD>
                  <TD className="text-on-surface-variant">{formatDate(o.createdAt)}</TD>
                  <TD align="right">
                    <span className="flex justify-end gap-3">
                      <Link href={`/admin/pedidos/${o.id}`} className="text-primary hover:underline label-caps">
                        Abrir →
                      </Link>
                      <span
                        title="Próximamente"
                        className="label-caps text-on-surface-variant underline decoration-dotted cursor-not-allowed"
                      >
                        Registrar seña
                      </span>
                    </span>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
