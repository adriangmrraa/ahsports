import { PageHeader, Card, StatCard, Badge } from "@/components/ui/Card";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { LinkButton } from "@/components/ui/Button";
import { PageGuide } from "@/components/admin/PageGuide";
import { BarChart3, Filter, Link2, Megaphone, Target, Users } from "lucide-react";
import {
  getCampaignPerformance,
  getChannelBreakdown,
  getFunnelStats,
  getLeadsByDay,
  getSummaryStats,
} from "@/lib/analytics/queries";
import { requireAgentAdmin } from "@/lib/agent/rbac";

export const dynamic = "force-dynamic";

export const metadata = { title: "Analytics — Admin" };

function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * C-02/H-05 — /admin/analytics: attribution dashboard over the `leads` table.
 * Summary cards, lead→contact→order funnel, per-campaign and per-channel
 * performance, and daily intake for the last 30 days.
 */
export default async function AnalyticsPage() {
  await requireAgentAdmin();

  const [summary, funnel, campaigns, channels, daily] = await Promise.all([
    getSummaryStats(),
    getFunnelStats(),
    getCampaignPerformance(),
    getChannelBreakdown(),
    getLeadsByDay(30),
  ]);

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Rendimiento de campañas y atribución de leads"
        action={
          <LinkButton href="/admin/analytics/link-generator" variant="secondary">
            <Link2 className="w-4 h-4" /> Generar link
          </LinkButton>
        }
      />

      <PageGuide
        what="Analytics muestra de dónde vienen los leads y cuántos terminan en pedido."
        whatFor="La atribución sale del canal, la campaña UTM o el link con ref. Usá «Generar link» para crear enlaces medibles."
        nextStep={{ href: "/admin/analytics/link-generator", label: "Generar link" }}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Leads totales" value={summary.totalLeads} icon={<Target className="w-4 h-4" />} tone="primary" />
        <StatCard label="Leads esta semana" value={summary.leadsThisWeek} icon={<Users className="w-4 h-4" />} tone="secondary" />
        <StatCard label="Campaña top" value={summary.topCampaign ?? "—"} icon={<Megaphone className="w-4 h-4" />} tone="tertiary" />
        <StatCard label="Conversión" value={percent(summary.conversionRate)} icon={<BarChart3 className="w-4 h-4" />} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <Card title="Embudo lead → contacto → pedido">
          <div className="flex flex-col gap-3">
            {[
              { label: "Leads", value: funnel.leads },
              { label: "Leads vinculados a contacto", value: funnel.leadsWithContact },
              { label: "Contactos totales", value: funnel.contacts },
              { label: "Pedidos de contactos-lead", value: funnel.ordersFromLeadContacts },
              { label: "Pedidos totales", value: funnel.orders },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between border-b border-outline-variant/50 pb-2 last:border-0 last:pb-0">
                <span className="text-sm text-on-surface-variant">{row.label}</span>
                <span className="data-mono text-on-surface font-semibold">{row.value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Leads por canal">
          {channels.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Sin datos todavía.</p>
          ) : (
            <Table variant="plain">
              <THead>
                <tr>
                  <TH>Canal</TH>
                  <TH align="right">Leads</TH>
                  <TH align="right">Convertidos</TH>
                </tr>
              </THead>
              <tbody>
                {channels.map((c) => (
                  <TR key={c.channel}>
                    <TD><Badge tone="muted">{c.channel}</Badge></TD>
                    <TD align="right">{c.leadCount}</TD>
                    <TD align="right">{c.convertedCount}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card title="Rendimiento por campaña" className="mb-6">
        {campaigns.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            Sin datos de campaña todavía — los leads capturados con <code className="data-mono">utm_campaign</code> o <code className="data-mono">ref:</code> aparecen acá.
          </p>
        ) : (
          <Table variant="plain" responsive>
            <THead>
              <tr>
                <TH>Campaña</TH>
                <TH align="right">Leads</TH>
                <TH align="right">Convertidos</TH>
                <TH align="right">Conversión</TH>
              </tr>
            </THead>
            <tbody>
              {campaigns.map((c) => (
                <TR key={c.campaign}>
                  <TD className="text-on-surface">{c.campaign}</TD>
                  <TD align="right">{c.leadCount}</TD>
                  <TD align="right">{c.convertedCount}</TD>
                  <TD align="right">{percent(c.rate)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Leads por día (últimos 30 días)" action={<Filter className="w-4 h-4 text-on-surface-variant" />}>
        {daily.length === 0 ? (
          <p className="text-sm text-on-surface-variant">Sin leads en el período.</p>
        ) : (
          <Table variant="plain" responsive>
            <THead>
              <tr>
                <TH>Fecha</TH>
                <TH>Fuente</TH>
                <TH align="right">Leads</TH>
              </tr>
            </THead>
            <tbody>
              {daily.map((d, i) => (
                <TR key={`${d.date}-${d.source ?? "none"}-${i}`}>
                  <TD className="data-mono">{d.date}</TD>
                  <TD>{d.source ? <Badge tone="muted">{d.source}</Badge> : <span className="text-on-surface-variant">orgánico</span>}</TD>
                  <TD align="right">{d.count}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
