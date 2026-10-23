import Link from "next/link";
import { requireAgentAdmin } from "@/lib/agent/rbac";
import { channelValues } from "@/lib/channels/types";
import { Card, PageHeader } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Search } from "lucide-react";
import { LiveRefresher } from "@/components/live/LiveRefresher";
import { ConversationTable } from "./ConversationTable";
import {
  accountOptionLabel,
  INBOX_CHANNEL_LABEL,
  normalizeAccountParam,
  normalizeChannelParam,
  type InboxAccountFilter,
} from "./filters";
import { listInboxAccountOptions, queryInboxConversationsPage } from "./queries";

/**
 * P4.2 / P4 + S14 — /admin/agent/inbox: searchable canonical conversation list.
 *
 * Every conversation is a DB fact; this view is read-only. It is restricted to
 * admin/gerencia via `requireAgentAdmin()`. Search + channel + account
 * filtering run in SQL and the list is cursor-paginated (latest activity
 * first) — see G3. The channel set is the full DB enum; the account filter
 * lists `channel_accounts` rows (empty on un-migrated installs, where the
 * select degrades to all/unassigned) — URL params stay shareable.
 */

function accountParamKey(account: InboxAccountFilter): string {
  return account.kind === "id" ? account.id : account.kind;
}

export default async function AgentInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; channel?: string; account?: string }>;
}) {
  await requireAgentAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const channelFilter = normalizeChannelParam(sp.channel);
  const accountFilter = normalizeAccountParam(sp.account);
  const accountKey = accountParamKey(accountFilter);

  const [accountOptions, firstPage] = await Promise.all([
    listInboxAccountOptions(),
    queryInboxConversationsPage({ q, channel: channelFilter, account: accountFilter }),
  ]);

  // Channel chips preserve q + account so filters compose across clicks.
  const channelLink = (channel: string | undefined) => {
    const params = new URLSearchParams();
    if (channel) params.set("channel", channel);
    if (sp.q) params.set("q", sp.q);
    if (accountKey !== "all") params.set("account", accountKey);
    const query = params.toString();
    return query ? `/admin/agent/inbox?${query}` : "/admin/agent/inbox";
  };

  return (
    <>
      <PageHeader
        title="Conversaciones"
        subtitle={channelFilter ? `Canal: ${INBOX_CHANNEL_LABEL[channelFilter]}` : "Últimas conversaciones"}
      />

      <form method="get" className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 max-w-md min-w-56">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por hilo, cliente o canal..." className="pl-9" />
        </div>
        <Select name="account" defaultValue={accountKey} className="max-w-xs">
          <option value="all">Todas las cuentas</option>
          <option value="unassigned">Sin cuenta (legado)</option>
          {accountOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {accountOptionLabel(a)}
            </option>
          ))}
          {accountFilter.kind === "id" && !accountOptions.some((a) => a.id === accountFilter.id) && (
            <option value={accountFilter.id}>Cuenta no listada ({accountFilter.id.slice(0, 8)}…)</option>
          )}
        </Select>
        {channelFilter && <input type="hidden" name="channel" value={channelFilter} />}
        <button
          type="submit"
          className="rounded-md label-caps text-sm px-4 py-2 bg-surface-container-high text-on-surface border border-outline-variant hover:border-primary transition-colors"
        >
          Buscar
        </button>
      </form>

      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-thin">
        {[{ key: undefined as string | undefined, label: "Todos" }]
          .concat(channelValues.map((c) => ({ key: c as string | undefined, label: INBOX_CHANNEL_LABEL[c] ?? c })))
          .map((option) => (
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
        <>
          {/* No table mounted → no stream of its own; refresh swaps in the
              table (which then merges live events itself) on first activity. */}
          <LiveRefresher endpoint="/api/events/inbox" />
          <Card>
            <div className="text-center py-10">
              <p className="label-caps text-primary mb-2">Sin conversaciones</p>
              <p className="text-sm text-on-surface-variant">
                Cuando el canal reciba mensajes, las conversaciones aparecerán acá.
              </p>
            </div>
          </Card>
        </>
      ) : (
        <ConversationTable
          key={`${q ?? ""}|${channelFilter ?? ""}|${accountKey}`}
          initialItems={firstPage.items}
          initialCursor={firstPage.nextCursor}
          q={q}
          channel={channelFilter}
          account={accountKey}
        />
      )}
    </>
  );
}
