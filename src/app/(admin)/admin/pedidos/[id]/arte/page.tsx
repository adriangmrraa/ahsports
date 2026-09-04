import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { applications, attachments, orders, organizations } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { PageHeader } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { ArrowLeft } from "lucide-react";
import { ArteManager, type AttachmentDTO } from "./ArteManager";

export default async function ArtePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) notFound();
  const [org] = order.organizationId
    ? await db.select().from(organizations).where(eq(organizations.id, order.organizationId)).limit(1)
    : [];

  const atts = await db
    .select()
    .from(attachments)
    .where(eq(attachments.orderId, id))
    .orderBy(desc(attachments.createdAt));

  const ids = atts.map((a) => a.id);
  const apps =
    ids.length > 0
      ? await db
          .select({ attachmentId: applications.attachmentId })
          .from(applications)
          .where(inArray(applications.attachmentId, ids))
      : [];
  const counts: Record<string, number> = {};
  for (const r of apps) counts[r.attachmentId] = (counts[r.attachmentId] ?? 0) + 1;

  const initial: AttachmentDTO[] = atts.map((a) => ({
    id: a.id,
    kind: a.kind,
    name: a.name,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    url: a.url,
    status: a.status,
    createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : new Date().toISOString(),
  }));

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Link href={`/admin/pedidos/${order.id}`} className="text-on-surface-variant hover:text-primary">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            Arte · Pedido #{order.number}
          </span>
        }
        subtitle={org ? org.name : "Particular"}
        action={
          <LinkButton href={`/admin/pedidos/${order.id}`} variant="secondary" size="sm">
            Volver al pedido
          </LinkButton>
        }
      />
      <ArteManager orderId={id} initial={initial} counts={counts} />
    </>
  );
}
