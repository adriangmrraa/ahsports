import { asc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, leadIdentities, organizations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PageHeader, Card, Badge } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button, LinkButton } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { PageGuide } from "@/components/admin/PageGuide";
import { Search, Users } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "muted" | "primary" | "secondary" | "success" | "error"> = {
  nuevo: "muted",
  contactado: "primary",
  calificado: "secondary",
  convertido: "success",
  perdido: "error",
};

/**
 * C-05 — standalone flat contacts view. Contacts were only reachable inside
 * /admin/organizaciones/[id]; this lists every contact with its organization
 * and the channels each one is reachable on (from lead_identities), with
 * search over name / email / phone / organization.
 */
export default async function ContactosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const safe = query.replace(/[%_\\]/g, "");

  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      role: contacts.role,
      status: contacts.status,
      marketingOptOut: contacts.marketingOptOut,
      createdAt: contacts.createdAt,
      organizationId: contacts.organizationId,
      organizationName: organizations.name,
    })
    .from(contacts)
    .leftJoin(organizations, eq(contacts.organizationId, organizations.id))
    .where(
      query
        ? or(
            ilike(contacts.name, `%${safe}%`),
            ilike(contacts.email, `%${safe}%`),
            ilike(contacts.phone, `%${safe}%`),
            ilike(organizations.name, `%${safe}%`),
          )
        : undefined,
    )
    .orderBy(asc(contacts.name))
    .limit(500);

  const contactIds = rows.map((row) => row.id);
  const identities = contactIds.length
    ? await db
        .select({ contactId: leadIdentities.contactId, channel: leadIdentities.channel })
        .from(leadIdentities)
        .where(inArray(leadIdentities.contactId, contactIds))
    : [];
  const channelsByContact = new Map<string, Set<string>>();
  for (const identity of identities) {
    const set = channelsByContact.get(identity.contactId) ?? new Set<string>();
    set.add(identity.channel);
    channelsByContact.set(identity.contactId, set);
  }

  return (
    <>
      <PageHeader
        title="Contactos"
        subtitle={`${rows.length} contactos${query ? ` · filtro: "${query}"` : ""}`}
      />

      <PageGuide
        what="Los contactos son las personas: quién atiende, quién recibe el presupuesto, quién hace el pedido."
        whatFor="Un contacto puede pertenecer a una organización o ser particular. Los canales muestran por dónde escribió."
        nextStep={{ href: "/admin/organizaciones", label: "Ver organizaciones" }}
      />

      <Card className="mb-4">
        <form method="get" action="/admin/contactos" className="flex gap-2">
          <Input name="q" defaultValue={query} placeholder="Buscar por nombre, email, teléfono u organización…" />
          <Button type="submit" variant="secondary"><Search className="w-4 h-4" /> Buscar</Button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <p className="label-caps text-primary mb-2">{query ? "Sin resultados" : "Sin contactos"}</p>
            <p className="text-sm text-on-surface-variant mb-4">
              {query ? "Probá con otro término." : "Los contactos se crean desde organizaciones, el presupuesto público o el agente de WhatsApp."}
            </p>
            {!query && <LinkButton href="/admin/organizaciones"><Users className="w-4 h-4" /> Ir a organizaciones</LinkButton>}
          </div>
        </Card>
      ) : (
        <Card>
          <Table responsive>
            <THead>
              <tr>
                <TH>Nombre</TH>
                <TH>Organización</TH>
                <TH>Teléfono</TH>
                <TH>Email</TH>
                <TH>Canales</TH>
                <TH>Estado</TH>
                <TH align="right">Acciones</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((c) => {
                const channels = [...(channelsByContact.get(c.id) ?? [])];
                return (
                  <TR key={c.id}>
                    <TD className="text-on-surface">
                      {c.name}
                      {c.role && <span className="block text-xs text-on-surface-variant">{c.role}</span>}
                    </TD>
                    <TD label="Organización">
                      {c.organizationId ? (
                        <LinkButton href={`/admin/organizaciones/${c.organizationId}`} variant="ghost" size="sm">
                          {c.organizationName ?? "—"}
                        </LinkButton>
                      ) : (
                        <span className="text-on-surface-variant">particular</span>
                      )}
                    </TD>
                    <TD className="data-mono" label="Teléfono">{c.phone ?? "—"}</TD>
                    <TD label="Email">{c.email ?? "—"}</TD>
                    <TD label="Canales">
                      <span className="inline-flex gap-1 flex-wrap">
                        {channels.length === 0
                          ? <span className="text-xs text-on-surface-variant">—</span>
                          : channels.map((channel) => <Badge key={channel} tone="secondary">{channel}</Badge>)}
                        {c.marketingOptOut && <Badge tone="warning">opt-out</Badge>}
                      </span>
                    </TD>
                    <TD label="Estado">
                      <Badge tone={STATUS_TONE[c.status] ?? "muted"}>{c.status}</Badge>
                    </TD>
                    <TD align="right">
                      {c.organizationId ? (
                        <LinkButton href={`/admin/organizaciones/${c.organizationId}`} variant="ghost" size="sm">Abrir org →</LinkButton>
                      ) : (
                        <span className="text-xs text-on-surface-variant">—</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
