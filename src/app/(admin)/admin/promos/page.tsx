import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { promotions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatMoneyAr } from "@/lib/telegram/format";
import { PageHeader, Card, Badge } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { PageGuide } from "@/components/admin/PageGuide";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { Plus } from "lucide-react";
import { PromoRowActions } from "./PromoRowActions";

export const dynamic = "force-dynamic";

export default async function PromosPage() {
  await requireUser();
  const rows = await db.select().from(promotions).orderBy(desc(promotions.createdAt)).limit(200);

  return (
    <>
      <PageHeader
        title="Promociones"
        subtitle={`${rows.length} promociones cargadas · las activas se exponen en /api/promotions y al agente de WhatsApp`}
        action={<LinkButton href="/admin/promos/nuevo"><Plus className="w-4 h-4" /> Nueva promo</LinkButton>}
      />
      <PageGuide
        what="Una promo es un combo con nombre: varios productos y cantidades que se ofrecen juntos."
        whatFor="Las activas se publican en la API y las usa el agente de WhatsApp. Sin precio propio, se cobra la suma real."
        nextStep={{ href: "/admin/promos/nuevo", label: "Nueva promo" }}
      />

      {rows.length === 0 ? (
        <AdminEmptyState
          title="Sin promociones"
          what="Las promos empaquetan productos del catálogo en una oferta con nombre y precio opcional."
          whatFor="Creá la primera con los productos y cantidades que querés ofrecer juntos."
          action={<LinkButton href="/admin/promos/nuevo">Cargar primera promo</LinkButton>}
        />
      ) : (
        <Card>
          <Table responsive>
            <THead>
              <tr>
                <TH>Nombre</TH>
                <TH>Contenido</TH>
                <TH>Precio promo</TH>
                <TH>Estado</TH>
                <TH align="right">Acciones</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((p) => (
                <TR key={p.id}>
                  <TD className="text-on-surface">
                    {p.name}
                    {p.description && <span className="block text-xs text-on-surface-variant">{p.description.slice(0, 80)}</span>}
                  </TD>
                  <TD label="Contenido">
                    {(p.items ?? []).length === 0
                      ? "—"
                      : (p.items ?? []).map((item) => `${item.quantity}x ${item.productName}`).join(" · ")}
                  </TD>
                  <TD className="data-mono" label="Precio promo">
                    {p.customPrice ? formatMoneyAr(p.customPrice) : "suma de precios"}
                  </TD>
                  <TD label="Estado">
                    <Badge tone={p.active ? "success" : "muted"}>{p.active ? "activa" : "inactiva"}</Badge>
                  </TD>
                  <TD align="right">
                    <PromoRowActions id={p.id} active={p.active} name={p.name} />
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
