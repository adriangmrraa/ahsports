import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { attachments, contacts, orders, organizations } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { PageHeader, Card, Badge } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { ArrowLeft, Plus } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

const kindLabel: Record<string, string> = {
  club: "Club",
  empresa: "Empresa",
  colegio: "Colegio",
  institucion: "Institución",
  particular: "Particular",
};

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

export default async function OrganizacionPerfilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  if (!org) notFound();

  const orgContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.organizationId, id))
    .orderBy(desc(contacts.createdAt));

  const orgOrders = await db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      totalQuoted: orders.totalQuoted,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.organizationId, id))
    .orderBy(desc(orders.createdAt))
    .limit(50);

  const approvedAttachments = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.organizationId, id), eq(attachments.status, "aprobado")))
    .orderBy(desc(attachments.createdAt))
    .limit(50);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Link href="/admin/organizaciones" className="text-on-surface-variant hover:text-primary">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            {org.name}
          </span>
        }
        subtitle={`${kindLabel[org.kind] ?? org.kind} · ${orgContacts.length} contactos · ${orgOrders.length} pedidos`}
        action={
          <LinkButton href="/admin/pedidos/nuevo">
            <Plus className="w-4 h-4" /> Nuevo pedido
          </LinkButton>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card title="Datos">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-on-surface-variant">Tipo</dt>
              <dd className="text-on-surface">{kindLabel[org.kind] ?? org.kind}</dd>
            </div>
            {org.taxId && (
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">CUIT</dt>
                <dd className="data-mono">{org.taxId}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-on-surface-variant">Alta</dt>
              <dd>{formatDate(org.createdAt)}</dd>
            </div>
          </dl>
          {org.notes && (
            <div className="pt-3 border-t border-outline-variant mt-3">
              <p className="label-caps text-on-surface-variant mb-1">Notas</p>
              <p className="text-sm whitespace-pre-wrap">{org.notes}</p>
            </div>
          )}
        </Card>

        <Card title="Contactos" className="lg:col-span-2">
          {orgContacts.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-4">Sin contactos registrados.</p>
          ) : (
            <div className="space-y-2">
              {orgContacts.map((c) => (
                <div key={c.id} className="flex justify-between items-center p-2 rounded bg-surface-container-low">
                  <div>
                    <p className="text-sm text-on-surface">
                      {c.name}
                      {c.role ? <span className="text-on-surface-variant"> · {c.role}</span> : null}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {[c.email, c.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                    </p>
                  </div>
                  <Badge tone={c.status === "convertido" ? "success" : "muted"}>{c.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Pedidos" className="mb-6">
        {orgOrders.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-4">Sin pedidos para esta organización.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>#</TH>
                <TH>Estado</TH>
                <TH align="right">Total</TH>
                <TH>Fecha</TH>
                <TH align="right">Acciones</TH>
              </tr>
            </THead>
            <tbody>
              {orgOrders.map((o) => (
                <TR key={o.id}>
                  <TD className="text-primary">#{o.number}</TD>
                  <TD>
                    <Badge tone={o.status === "bloqueado_pago" ? "error" : o.status === "entregado" ? "success" : "muted"}>
                      {statusLabel[o.status] ?? o.status}
                    </Badge>
                  </TD>
                  <TD align="right">{formatCurrency(o.totalQuoted)}</TD>
                  <TD className="text-on-surface-variant">{formatDate(o.createdAt)}</TD>
                  <TD align="right">
                    <Link href={`/admin/pedidos/${o.id}`} className="text-primary hover:underline label-caps">
                      Abrir →
                    </Link>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Biblioteca aprobada">
        {approvedAttachments.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-4">Sin archivos aprobados.</p>
        ) : (
          <div className="space-y-1">
            {approvedAttachments.map((a) => (
              <div
                key={a.id}
                className="flex justify-between items-center text-sm p-2 rounded hover:bg-surface-bright/5"
              >
                <span className="text-on-surface truncate">{a.name}</span>
                <Badge tone="success">aprobado</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
