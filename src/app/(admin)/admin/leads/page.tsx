import Link from "next/link";
import { db } from "@/db/client";
import { channelAccounts, leads } from "@/db/schema";
import { desc, eq, ilike, or, sql } from "drizzle-orm";

const PAGE_SIZE = 50;
import { PageHeader, Card, Badge } from "@/components/ui/Card";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";
import { PageGuide } from "@/components/admin/PageGuide";
import { Search, Target } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { requireAgentAdmin } from "@/lib/agent/rbac";
import { LiveRefresher } from "@/components/live/LiveRefresher";

type Tone = "primary" | "secondary" | "tertiary" | "error" | "success" | "warning" | "muted";

const statusLabel: Record<string, { label: string; tone: Tone }> = {
  nuevo: { label: "Nuevo", tone: "primary" },
  contactado: { label: "Contactado", tone: "secondary" },
  calificado: { label: "Calificado", tone: "tertiary" },
  convertido: { label: "Convertido", tone: "success" },
  perdido: { label: "Perdido", tone: "muted" },
};

export const metadata = { title: "Leads — Admin" };

/**
 * C-01 — /admin/leads: top-of-funnel captures with attribution. Lists the
 * `leads` table (W6) newest-first with status/channel badges, the resolved
 * campaign (coalesce utm_campaign / ref-decoded campaign_id) and the
 * first-attribution account. Read-only; status transitions are a later wave.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  await requireAgentAdmin();
  const sp = await searchParams;
  const filterStatus = sp.status && sp.status in statusLabel ? sp.status : undefined;
  const q = sp.q?.trim() || undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const campaignLabel = sql<string | null>`coalesce(${leads.utmCampaign}, ${leads.campaignId})`;

  const where =
    filterStatus && q
      ? sql`${leads.status} = ${filterStatus} AND (${leads.phone} ILIKE ${"%" + q + "%"} OR ${leads.name} ILIKE ${"%" + q + "%"})`
      : filterStatus
        ? eq(leads.status, filterStatus as never)
        : q
          ? or(ilike(leads.phone, `%${q}%`), ilike(leads.name, `%${q}%`))
          : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(leads)
    .where(where);

  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      phone: leads.phone,
      status: leads.status,
      channel: leads.channel,
      platform: leads.platform,
      refCode: leads.refCode,
      utmSource: leads.utmSource,
      campaign: campaignLabel,
      firstMessage: leads.firstMessage,
      accountSender: channelAccounts.senderAddress,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .leftJoin(channelAccounts, eq(channelAccounts.id, leads.channelAccountId))
    .where(where)
    .orderBy(desc(leads.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (q) params.set("q", q);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/admin/leads?${qs}` : "/admin/leads";
  };

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`${total} leads capturados — atribución de campañas y canales`}
      />

      <PageGuide
        what="Un lead es alguien que mostró interés: escribió por WhatsApp, entró a un link o pidió un presupuesto."
        whatFor="El estado sigue nuevo → contactado → calificado → convertido. La campaña y el ref muestran de dónde vino."
        nextStep={{ href: "/admin/analytics", label: "Ver analytics" }}
      />

      {/* Server-rendered list: any SSE event re-renders this page with fresh rows. */}
      <LiveRefresher endpoint="/api/events/leads" />

      <form method="get" className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <Input name="q" defaultValue={q ?? ""} placeholder="Buscar por nombre o teléfono..." className="pl-9" />
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
        <Link
          href={q ? `/admin/leads?q=${encodeURIComponent(q)}` : "/admin/leads"}
          className={`label-caps px-3 py-1.5 rounded-md border transition-colors ${!filterStatus ? "border-primary text-primary bg-primary/10" : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"}`}
        >
          Todos
        </Link>
        {Object.entries(statusLabel).map(([k, v]) => {
          const href = q
            ? `/admin/leads?status=${k}&q=${encodeURIComponent(q)}`
            : `/admin/leads?status=${k}`;
          return (
            <Link
              key={k}
              href={href}
              className={`label-caps px-3 py-1.5 rounded-md border transition-colors whitespace-nowrap ${filterStatus === k ? "border-primary text-primary bg-primary/10" : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"}`}
            >
              {v.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <Target className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="label-caps text-primary mb-2">Sin leads</p>
            <p className="text-sm text-on-surface-variant">
              Los leads se capturan automáticamente al primer contacto por WhatsApp/Telegram
              o vía <code className="data-mono">POST /api/leads</code>.
            </p>
          </div>
        </Card>
      ) : (
        <>
        <Table responsive>
          <THead>
            <tr>
              <TH>Lead</TH>
              <TH>Estado</TH>
              <TH>Canal</TH>
              <TH>Campaña</TH>
              <TH>Ref</TH>
              <TH>Cuenta</TH>
              <TH>Fecha</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((lead) => {
              const st = statusLabel[lead.status] ?? { label: lead.status, tone: "muted" as Tone };
              const channelLabel = lead.platform ?? lead.channel;
              return (
                <TR key={lead.id}>
                  <TD label="Lead">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-on-surface">{lead.name ?? "—"}</span>
                      <span className="text-xs text-on-surface-variant data-mono">{lead.phone ?? lead.id.slice(0, 8)}</span>
                    </div>
                  </TD>
                  <TD label="Estado">
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </TD>
                  <TD label="Canal">
                    {channelLabel ? <Badge tone="muted">{channelLabel}</Badge> : <span className="text-on-surface-variant">—</span>}
                  </TD>
                  <TD className="text-on-surface-variant" label="Campaña">
                    {lead.campaign ?? <span className="text-on-surface-variant">—</span>}
                  </TD>
                  <TD label="Ref">
                    {lead.refCode ? (
                      <span className="data-mono text-xs text-on-surface-variant" title={lead.refCode}>
                        {lead.refCode.length > 20 ? `${lead.refCode.slice(0, 20)}…` : lead.refCode}
                      </span>
                    ) : (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </TD>
                  <TD className="text-on-surface-variant" label="Cuenta">{lead.accountSender ?? "—"}</TD>
                  <TD className="text-on-surface-variant" label="Fecha">{formatDateTime(lead.createdAt)}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
        {pageCount > 1 && (
          <div className="mt-4 flex items-center justify-between gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="text-sm text-primary hover:underline">
                ← Anterior
              </Link>
            ) : (
              <span />
            )}
            <span className="text-xs text-on-surface-variant">
              Página {page} de {pageCount}
            </span>
            {page < pageCount ? (
              <Link href={pageHref(page + 1)} className="text-sm text-primary hover:underline">
                Siguiente →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
        </>
      )}
    </>
  );
}
