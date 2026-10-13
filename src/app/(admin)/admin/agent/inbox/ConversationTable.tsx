"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { loadConversations } from "@/app/actions/inbox";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { CHANNEL_LABEL } from "@/lib/agent/inbox-labels";
import { formatDateTime } from "@/lib/utils";
import type { ConversationCursor, ConversationListItem } from "@/lib/agent/inbox";

/**
 * Paginated conversation list (G3). Receives the first server-rendered page and
 * appends older conversations on demand, keeping the filters server-side.
 */
export function ConversationTable({
  initialItems,
  initialCursor,
  q,
  channel,
}: {
  initialItems: ConversationListItem[];
  initialCursor: ConversationCursor | null;
  q?: string;
  channel?: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState<ConversationCursor | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialCursor !== null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const loadMore = () => {
    if (!hasMore || pending) return;
    startTransition(async () => {
      try {
        const page = await loadConversations({ q, channel, cursor });
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
