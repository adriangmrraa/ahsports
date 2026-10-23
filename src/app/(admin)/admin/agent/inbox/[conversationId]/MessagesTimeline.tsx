"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { loadMessages } from "@/app/actions/inbox";
import { Badge, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  CHANNEL_LABEL,
  CONTENT_LABEL,
  DELIVERY_LABEL,
  DIRECTION_LABEL,
  SENDER_LABEL,
  deliveryTone,
} from "@/lib/agent/inbox-labels";
import { encodeStreamCursor } from "@/lib/live/events";
import { useEventStream } from "@/lib/live/useEventStream";
import { formatDateTime } from "@/lib/utils";
import type { ChatMessageItem, MessageCursor } from "@/lib/agent/inbox";

/**
 * Conversation timeline (G3). Renders the newest messages first and loads older
 * pages on scroll (cursor on `created_at`), preserving full provenance.
 */
export function MessagesTimeline({
  conversationId,
  initialMessages,
  initialCursor,
}: {
  conversationId: string;
  initialMessages: ChatMessageItem[];
  initialCursor: MessageCursor | null;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [cursor, setCursor] = useState<MessageCursor | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialCursor !== null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Stream cursor is fixed at mount from the newest rendered message: the
  // server emits only rows strictly newer, and id-dedup absorbs any re-emit
  // after an EventSource reconnect. Fixed => the endpoint never changes, so
  // the connection never churns.
  const [streamEndpoint] = useState(() => {
    const newest = initialMessages[0];
    const query = newest
      ? `?cursor=${encodeURIComponent(encodeStreamCursor(newest.createdAt, newest.id))}`
      : "";
    return `/api/events/conversations/${conversationId}${query}`;
  });

  useEventStream(streamEndpoint, (data) => {
    const message = data as ChatMessageItem;
    if (typeof message?.id !== "string" || typeof message?.createdAt !== "string") return;
    // Timeline renders newest-first — live rows prepend.
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [message, ...prev]));
  });

  const loadMore = useCallback(() => {
    if (!hasMore || pending) return;
    startTransition(async () => {
      try {
        const page = await loadMessages({ conversationId, cursor });
        setMessages((prev) => [...prev, ...page.items]);
        setCursor(page.nextCursor);
        setHasMore(page.nextCursor !== null);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    });
  }, [conversationId, cursor, hasMore, pending]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  return (
    <Card title={`Mensajes (${messages.length})`}>
      {messages.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Esta conversación todavía no tiene mensajes.</p>
      ) : (
        <>
          <ol className="flex flex-col gap-3">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`rounded-md border border-outline-variant p-4 ${
                  message.direction === "inbound" ? "bg-surface-container-low" : "bg-surface-container"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge tone={message.direction === "inbound" ? "tertiary" : "primary"}>
                    {DIRECTION_LABEL[message.direction] ?? message.direction}
                  </Badge>
                  <Badge tone="muted">{SENDER_LABEL[message.senderKind] ?? message.senderKind}</Badge>
                  <Badge tone="muted">{CHANNEL_LABEL[message.channel] ?? message.channel}</Badge>
                  <Badge tone="muted">{CONTENT_LABEL[message.contentType] ?? message.contentType}</Badge>
                  <Badge tone={deliveryTone(message.deliveryState)}>
                    {DELIVERY_LABEL[message.deliveryState] ?? message.deliveryState}
                  </Badge>
                  <span className="data-mono text-xs text-on-surface-variant ml-auto">
                    {formatDateTime(message.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-on-surface whitespace-pre-wrap break-words">{message.content || "—"}</p>
                <p className="data-mono text-[11px] text-on-surface-variant mt-2">
                  id {message.platformMessageId}
                  {message.senderRef ? ` · remitente ${message.senderRef}` : ""}
                </p>
              </li>
            ))}
          </ol>

          <div ref={sentinelRef} className="flex flex-col items-center gap-2 pt-4">
            {hasMore ? (
              <Button type="button" variant="tertiary" onClick={loadMore} disabled={pending}>
                {pending ? "Cargando mensajes anteriores..." : "Cargar mensajes anteriores"}
              </Button>
            ) : (
              <span className="label-caps text-xs text-on-surface-variant">Inicio de la conversación</span>
            )}
            {failed && <span className="text-xs text-error">No se pudieron cargar más mensajes.</span>}
          </div>
        </>
      )}
    </Card>
  );
}
