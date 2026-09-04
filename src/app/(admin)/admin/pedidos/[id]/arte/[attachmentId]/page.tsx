import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { applications, attachments, orderLines, orders, products, techniques } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { PageHeader, Card, Badge } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { ArrowLeft } from "lucide-react";
import { ApplicationsManager, AppStatusBadge, type AppLine, type AppRow, type AppTechnique } from "./ApplicationsManager";
import { KIND_LABEL } from "../ArteManager";

type Tab = "informacion" | "aplicaciones" | "historial";

export default async function AttachmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; attachmentId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id, attachmentId } = await params;
  const sp = await searchParams;

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) notFound();
  const [att] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.orderId, id)))
    .limit(1);
  if (!att) notFound();

  const tabs: Tab[] = att.version > 1 ? ["informacion", "aplicaciones", "historial"] : ["informacion", "aplicaciones"];
  const tab: Tab = sp.tab === "aplicaciones" || (sp.tab === "historial" && att.version > 1) ? sp.tab : "informacion";

  const appRows: AppRow[] = [];
  let lines: AppLine[] = [];
  let techs: AppTechnique[] = [];

  if (tab === "aplicaciones") {
    const orderLineRows = await db
      .select({ id: orderLines.id, productId: orderLines.productId, productName: products.name })
      .from(orderLines)
      .leftJoin(products, eq(orderLines.productId, products.id))
      .where(eq(orderLines.orderId, id));
    const withZones: AppLine[] = [];
    for (const l of orderLineRows) {
      const [p] = await db.select().from(products).where(eq(products.id, l.productId)).limit(1);
      withZones.push({ id: l.id, productName: l.productName ?? l.productId, zones: p?.zones ?? [] });
    }
    lines = withZones;

    techs = (await db.select().from(techniques).where(eq(techniques.active, true))).map((t) => ({
      id: t.id,
      name: t.name,
      costPerSquareMeter: String(t.costPerSquareMeter),
      setupCost: String(t.setupCost),
    }));

    const apps = await db
      .select()
      .from(applications)
      .where(eq(applications.attachmentId, attachmentId))
      .orderBy(desc(applications.id));
    for (const a of apps) {
      const [t] = a.techniqueId
        ? await db.select().from(techniques).where(eq(techniques.id, a.techniqueId)).limit(1)
        : [];
      appRows.push({
        id: a.id,
        zone: a.zone,
        view: a.view,
        techniqueId: a.techniqueId,
        techniqueName: t?.name ?? null,
        techniqueCostPerSqm: t ? Number(t.costPerSquareMeter) : null,
        techniqueSetup: t ? Number(t.setupCost) : null,
        widthCm: a.widthCm ? String(a.widthCm) : null,
        heightCm: a.heightCm ? String(a.heightCm) : null,
        quantity: a.quantity,
        instructions: a.instructions,
      });
    }
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Link href={`/admin/pedidos/${order.id}/arte`} className="text-on-surface-variant hover:text-primary">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            {att.name}
          </span>
        }
        subtitle={`Pedido #${order.number} · ${KIND_LABEL[att.kind] ?? att.kind}`}
        action={
          <LinkButton href={`/admin/pedidos/${order.id}/arte`} variant="secondary" size="sm">
            Volver al arte
          </LinkButton>
        }
      />

      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <LinkButton
            key={t}
            href={`/admin/pedidos/${order.id}/arte/${att.id}?tab=${t}`}
            variant={tab === t ? "primary" : "secondary"}
            size="sm"
          >
            {t === "informacion" ? "Información" : t === "aplicaciones" ? "Aplicaciones" : "Historial"}
          </LinkButton>
        ))}
      </div>

      {tab === "informacion" && (
        <Card title="Información del archivo">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-on-surface-variant">Tipo</dt><dd><Badge tone="muted">{KIND_LABEL[att.kind] ?? att.kind}</Badge></dd></div>
            <div className="flex justify-between"><dt className="text-on-surface-variant">Estado</dt><dd><AppStatusBadge status={att.status} /></dd></div>
            <div className="flex justify-between"><dt className="text-on-surface-variant">Archivo original</dt><dd className="data-mono">{att.originalName ?? "-"}</dd></div>
            <div className="flex justify-between"><dt className="text-on-surface-variant">MIME</dt><dd className="data-mono">{att.mimeType ?? "-"}</dd></div>
            <div className="flex justify-between"><dt className="text-on-surface-variant">Tamaño</dt><dd>{att.sizeBytes != null ? `${(att.sizeBytes / 1024).toFixed(0)} KB` : "-"}</dd></div>
            <div className="flex justify-between"><dt className="text-on-surface-variant">Subido por</dt><dd>{att.uploadedByRole}</dd></div>
            <div className="flex justify-between"><dt className="text-on-surface-variant">Versión</dt><dd className="data-mono">v{att.version}</dd></div>
            <div className="flex justify-between"><dt className="text-on-surface-variant">URL</dt><dd><a href={att.url} target="_blank" rel="noreferrer" className="text-primary hover:underline data-mono">Abrir archivo</a></dd></div>
            {att.notes && (
              <div className="pt-3 border-t border-outline-variant mt-3">
                <p className="label-caps text-on-surface-variant mb-1">Notas</p>
                <p className="text-sm whitespace-pre-wrap">{att.notes}</p>
              </div>
            )}
          </dl>
        </Card>
      )}

      {tab === "aplicaciones" && (
        <ApplicationsManager attachmentId={att.id} initial={appRows} lines={lines} techniques={techs} />
      )}

      {tab === "historial" && (
        <Card title={`Historial · versión ${att.version}`}>
          <p className="text-sm text-on-surface-variant">
            Este archivo va por la versión {att.version}. El reemplazo de archivos versiona el adjunto
            conservando sus aplicaciones.
          </p>
          {att.notes && <p className="text-sm mt-3 whitespace-pre-wrap">{att.notes}</p>}
        </Card>
      )}
    </>
  );
}
