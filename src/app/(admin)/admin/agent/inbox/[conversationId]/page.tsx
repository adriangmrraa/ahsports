import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chatMessages, contacts, conversations, organizations } from "@/db/schema";
import { requireAgentAdmin } from "@/lib/agent/rbac";
import { formatDateTime } from "@/lib/utils";
import { Badge, Card, PageHeader } from "@/components/ui/Card";
import { ArrowLeft } from "lucide-react";

/**
 * P4.2 / P4 — /admin/agent/inbox/[conversationId]: canonical timeline.
 *
 * Renders every persisted message fact with full provenance (channel,
 * direction, sender kind, delivery state, content type and timestamp). The view
 * is read-only and restricted to admin/gerencia via `requireAgentAdmin()`.
 */

const CHANNEL_LABEL: Record<string, string> = { telegram: "Telegram", whatsapp: "WhatsApp" };

const DIRECTION_LABEL: Record<string, string> = { inbound: "Entrante", outbound: "Saliente" };

const SENDER_LABEL: Record<string, string> = {
  customer: "Cliente",
  agent: "Agente IA",
  operator: "Operador",
};

const DELIVERY_LABEL: Record<string, string> = {
  received: "Recibido",
  queued: "En cola",
  sent: "Enviado",
  failed: "Falló",
  imported: "Importado",
};

const CONTENT_LABEL: Record<string, string> = {
  text: "Texto",
  image: "Imagen",
  document: "Documento",
  system: "Sistema",
};

function deliveryTone(state: string) {
  if (state === "failed") return "error" as const;
  if (state === "sent") return "success" as const;
  if (state === "queued") return "warning" as const;
  return "muted" as const;
}

export default async function ConversationTimelinePage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  await requireAgentAdmin();
  const { conversationId } = await params;

  const [conversation] = await db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      externalThreadId: conversations.externalThreadId,
      status: conversations.status,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt,
      customerName: contacts.name,
      orgName: organizations.name,
    })
    .from(conversations)
    .leftJoin(contacts, eq(conversations.customerId, contacts.id))
    .leftJoin(organizations, eq(conversations.organizationId, organizations.id))
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) notFound();

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(500);

  return (
    <div className="p-6">
      <PageHeader
        title="Timeline de conversación"
        subtitle={`${CHANNEL_LABEL[conversation.channel] ?? conversation.channel} · hilo ${conversation.externalThreadId}${
          conversation.customerName ? ` · ${conversation.customerName}` : ""
        }`}
        action={
          <Link
            href="/admin/agent/inbox"
            className="text-primary hover:underline label-caps flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Volver a conversaciones
          </Link>
        }
      />

      <div className="flex flex-col gap-6">
        <Card title="Conversación">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="label-caps text-on-surface-variant">Estado</dt>
              <dd>
                <Badge tone={conversation.status === "open" ? "success" : "muted"}>
                  {conversation.status === "open" ? "Abierta" : "Cerrada"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="label-caps text-on-surface-variant">Último mensaje</dt>
              <dd className="data-mono text-on-surface">{formatDateTime(conversation.lastMessageAt)}</dd>
            </div>
            <div>
              <dt className="label-caps text-on-surface-variant">Creada</dt>
              <dd className="data-mono text-on-surface">{formatDateTime(conversation.createdAt)}</dd>
            </div>
            <div>
              <dt className="label-caps text-on-surface-variant">Mensajes</dt>
              <dd className="data-mono text-on-surface">{messages.length}</dd>
            </div>
          </dl>
        </Card>

        <Card title={`Mensajes (${messages.length})`}>
          {messages.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Esta conversación todavía no tiene mensajes.</p>
          ) : (
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
          )}
        </Card>
      </div>
    </div>
  );
}
