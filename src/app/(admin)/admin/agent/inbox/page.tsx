import Link from "next/link";
import { requireAgentAdmin } from "@/lib/agent/rbac";
import { queryConversationsPage } from "@/lib/agent/inbox";
import { CHANNEL_LABEL } from "@/lib/agent/inbox-labels";
import { Card, PageHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Search } from "lucide-react";
import { ConversationTable } from "./ConversationTable";

/**
 * P4.2 / P4 — /admin/agent/inbox: searchable canonical conversation list.
 *
 * Every conversation is a DB fact; this view is read-only. It is restricted to
 * admin/gerencia via `requireAgentAdmin()`. Search + channel filtering run in
 * SQL and the list is cursor-paginated (latest activity first) — see G3.
 */

export default async function AgentInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; channel?: string }>;
}) {
  await requireAgentAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const channelFilter = sp.channel === "telegram" || sp.channel === "whatsapp" ? sp.channel : undefined;

  const firstPage = await queryConversationsPage({ q, channel: channelFilter });

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
        subtitle={channelFilter ? `Canal: ${CHANNEL_LABEL[channelFilter]}` : "Últimas conversaciones"}
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

      {firstPage.items.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <p className="label-caps text-primary mb-2">Sin conversaciones</p>
            <p className="text-sm text-on-surface-variant">
              Cuando el canal reciba mensajes, las conversaciones aparecerán acá.
            </p>
          </div>
        </Card>
      ) : (
        <ConversationTable
          key={`${q ?? ""}|${channelFilter ?? ""}`}
          initialItems={firstPage.items}
          initialCursor={firstPage.nextCursor}
          q={q}
          channel={channelFilter}
        />
      )}
    </>
  );
}
