import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, conversations, organizations } from "@/db/schema";
import { requireAgentAdmin } from "@/lib/agent/rbac";
import { formatDateTime } from "@/lib/utils";
import { Badge, Card, PageHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Search } from "lucide-react";

/**
 * P4.2 / P4 — /admin/agent/inbox: searchable canonical conversation list.
 *
 * Every conversation is a DB fact; this view is read-only. It is restricted to
 * admin/gerencia via `requireAgentAdmin()`.
 */

const CHANNEL_LABEL: Record<string, string> = { telegram: "Telegram", whatsapp: "WhatsApp" };

export default async function AgentInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; channel?: string }>;
}) {
  await requireAgentAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase() || undefined;
  const channelFilter = sp.channel === "telegram" || sp.channel === "whatsapp" ? sp.channel : undefined;

  const rows = await db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      externalThreadId: conversations.externalThreadId,
      status: conversations.status,
      lastMessageAt: conversations.lastMessageAt,
      unreadCount: conversations.unreadCount,
      createdAt: conversations.createdAt,
      customerName: contacts.name,
      orgName: organizations.name,
    })
    .from(conversations)
    .leftJoin(contacts, eq(conversations.customerId, contacts.id))
    .leftJoin(organizations, eq(conversations.organizationId, organizations.id))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(200);

  const filtered = rows.filter((row) => {
    if (channelFilter && row.channel !== channelFilter) return false;
    if (q) {
      const hay = `${row.externalThreadId} ${row.customerName ?? ""} ${row.orgName ?? ""} ${row.channel}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const channelLink = (channel: string | undefined) => {
    const params = new URLSearchParams();
    if (channel) params.set("channel", channel);
    if (sp.q) params.set("q", sp.q);
    const query = params.toString();
    return query ? `/admin/agent/inbox?${query}` : "/admin/agent/inbox";
  };

  return (
    <>
      <PageHeader
        title="Conversaciones"
        subtitle={channelFilter ? `Canal: ${CHANNEL_LABEL[channelFilter]}` : `${rows.length} conversaciones en el sistema`}
      />

      <form method="get" className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por hilo, cliente o canal..." className="pl-9" />
        </div>
        {channelFilter && <input type="hidden" name="channel" value={channelFilter} />}
        <button
          type="submit"
          className="rounded-md label-caps text-sm px-4 py-2 bg-surface-container-high text-on-surface border border-outline-variant hover:border-primary transition-colors"
        >
          Buscar
        </button>
      </form>

      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-thin">
        {[
          { key: undefined, label: "Todos" },
          { key: "telegram", label: "Telegram" },
          { key: "whatsapp", label: "WhatsApp" },
        ].map((option) => (
          <Link
            key={option.label}
            href={channelLink(option.key)}
            className={`label-caps px-3 py-1.5 rounded-md border transition-colors whitespace-nowrap ${
              channelFilter === option.key
                ? "border-primary text-primary bg-primary/10"
                : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <p className="label-caps text-primary mb-2">Sin conversaciones</p>
            <p className="text-sm text-on-surface-variant">
              Cuando el canal reciba mensajes, las conversaciones aparecerán acá.
            </p>
          </div>
        </Card>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Canal</TH>
              <TH>Hilo</TH>
              <TH>Cliente / Organización</TH>
              <TH>Estado</TH>
              <TH align="right">No leídos</TH>
              <TH>Último mensaje</TH>
              <TH align="right">Acciones</TH>
            </tr>
          </THead>
          <tbody>
            {filtered.map((row) => (
              <TR key={row.id}>
                <TD>
                  <Badge tone={row.channel === "telegram" ? "primary" : "secondary"}>
                    {CHANNEL_LABEL[row.channel] ?? row.channel}
                  </Badge>
                </TD>
                <TD className="data-mono text-on-surface">{row.externalThreadId}</TD>
                <TD>
                  <div className="text-on-surface">{row.orgName ?? row.customerName ?? "Particular"}</div>
                  {row.orgName && row.customerName && (
                    <div className="text-xs text-on-surface-variant">{row.customerName}</div>
                  )}
                </TD>
                <TD>
                  <Badge tone={row.status === "open" ? "success" : "muted"}>
                    {row.status === "open" ? "Abierta" : "Cerrada"}
                  </Badge>
                </TD>
                <TD align="right">{row.unreadCount}</TD>
                <TD className="text-on-surface-variant">{formatDateTime(row.lastMessageAt)}</TD>
                <TD align="right">
                  <Link
                    href={`/admin/agent/inbox/${row.id}`}
                    className="text-primary hover:underline label-caps"
                  >
                    Abrir →
                  </Link>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
