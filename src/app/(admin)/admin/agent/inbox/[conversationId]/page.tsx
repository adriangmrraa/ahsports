import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, conversations, organizations } from "@/db/schema";
import { requireAgentAdmin } from "@/lib/agent/rbac";
import { queryMessagesPage } from "@/lib/agent/inbox";
import { CHANNEL_LABEL } from "@/lib/agent/inbox-labels";
import { formatDateTime } from "@/lib/utils";
import { Badge, Card, PageHeader } from "@/components/ui/Card";
import { ArrowLeft } from "lucide-react";
import { MessagesTimeline } from "./MessagesTimeline";

/**
 * P4.2 / P4 — /admin/agent/inbox/[conversationId]: canonical timeline.
 *
 * Renders persisted message facts with full provenance (channel, direction,
 * sender kind, delivery state, content type and timestamp). The view is
 * read-only and restricted to admin/gerencia via `requireAgentAdmin()`. The
 * timeline is cursor-paginated: newest first, older pages loaded on scroll (G3).
 */

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

  const firstPage = await queryMessagesPage({ conversationId });

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
          </dl>
        </Card>

        <MessagesTimeline
          conversationId={conversationId}
          initialMessages={firstPage.items}
          initialCursor={firstPage.nextCursor}
        />
      </div>
    </div>
  );
}
