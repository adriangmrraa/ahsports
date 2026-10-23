"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { loadConversations } from "@/app/actions/inbox";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { useEventStream } from "@/lib/live/useEventStream";
import { formatDateTime } from "@/lib/utils";
import type { ConversationCursor } from "@/lib/agent/inbox";
import { channelBadgeTone, INBOX_CHANNEL_LABEL, type InboxConversationItem } from "./filters";

/**
 * Paginated conversation list (G3). Receives the first server-rendered page and
 * appends older conversations on demand, keeping the filters server-side.
 */
export function ConversationTable({
  initialItems,
  initialCursor,
  q,
  channel,
  account,
}: {
  initialItems: InboxConversationItem[];
  initialCursor: ConversationCursor | null;
  q?: string;
  channel?: string;
  /** URL value: "all" | "unassigned" | channel_accounts UUID. */
  account?: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState<ConversationCursor | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialCursor !== null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live inbox activity (SSE): refetch the head page through the same server
  // action the pagination uses — filters stay server-side — and merge it with
  // the loaded tail instead of resetting state (router.refresh can't reach
  // it). Debounced so an inbound burst coalesces into one fetch.
  useEventStream("/api/events/inbox", () => {
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    liveTimerRef.current = setTimeout(() => {
      startTransition(async () => {
        try {
          const page = await loadConversations({ q, channel, account, cursor: null });
          setItems((prev) => {
            const freshIds = new Set(page.items.map((item) => item.id));
            return [...page.items, ...prev.filter((item) => !freshIds.has(item.id))];
          });
        } catch {
          // Transient failure — the next event or a reconnect heals the list.
        }
      });
    }, 500);
  });

  useEffect(
    () => () => {
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    },
    [],
  );

  const loadMore = () => {
    if (!hasMore || pending) return;
    startTransition(async () => {
      try {
        const page = await loadConversations({ q, channel, account, cursor });
        setItems((prev) => [...prev, ...page.items]);
        setCursor(page.nextCursor);
        setHasMore(page.nextCursor !== null);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    });
  };

  return (
    <div className="space-y-4">
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
          {items.map((row) => (
            <TR key={row.id}>
              <TD>
                <Badge tone={channelBadgeTone(row.channel)}>
                  {INBOX_CHANNEL_LABEL[row.channel] ?? row.channel}
                </Badge>
                {row.accountLabel && (
                  <div className="mt-1 text-xs text-on-surface-variant truncate max-w-[10rem]">
                    {row.accountLabel}
                  </div>
                )}
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

      <div className="flex flex-col items-center gap-2">
        {hasMore ? (
          <Button type="button" variant="tertiary" onClick={loadMore} disabled={pending}>
            {pending ? "Cargando..." : "Cargar más"}
          </Button>
        ) : (
          <span className="label-caps text-xs text-on-surface-variant">No hay más conversaciones</span>
        )}
        {failed && (
          <span className="text-xs text-error">No se pudieron cargar más conversaciones.</span>
        )}
      </div>
    </div>
  );
}
