import { db } from "@/db/client";
import { orders, pricingRules, settings } from "@/db/schema";
import { desc, asc } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import { Badge, Card, PageHeader } from "@/components/ui/Card";
import { PricingRulesManager } from "./PricingRulesManager";
import { WorkshopSettingsForm } from "./WorkshopSettingsForm";

/**
 * F5-07 — /admin/configuracion: hub con todas las reglas.
 * 1) Reglas de precio (F2-17 integrado) · 2) Datos del taller (F5-08) ·
 * 3) Notificaciones (placeholder) · 4) Storage (info) · 5) Snapshots (info).
 */
export default async function ConfiguracionPage() {
  await requireUser();
  const [rules, settingRows, snapshots] = await Promise.all([
    db.select().from(pricingRules).orderBy(asc(pricingRules.name)).limit(500),
    db.select().from(settings),
    db
      .select({ number: orders.number, snapshot: orders.snapshot })
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(10),
  ]);
  const initial: Record<string, unknown> = Object.fromEntries(settingRows.map((s) => [s.key, s.value]));
  const storageProvider = process.env.STORAGE_PROVIDER === "s3" ? "S3/R2" : "Local (public/uploads)";
  const withSnapshot = snapshots.filter((s) => s.snapshot);

  return (
    <div className="p-6">
      <PageHeader
        title="Configuración"
        subtitle={`${rules.length} reglas de precio · solo una puede estar activa`}
      />

      <div className="flex flex-col gap-6">
        <Card title="Reglas de precio">
          <PricingRulesManager initial={rules} />
        </Card>

        <Card title="Datos del taller">
          <WorkshopSettingsForm initial={initial} />
        </Card>

        <Card title="Notificaciones">
          <p className="text-sm text-on-surface-variant">
            Próximamente: integración con WhatsApp Business para avisar al cliente
            (presupuesto recibido, seña confirmada, pedido entregado).
          </p>
        </Card>

        <Card
          title="Almacenamiento de adjuntos"
          action={<Badge tone={storageProvider.startsWith("S3") ? "success" : "warning"}>{storageProvider}</Badge>}
        >
          <p className="text-sm text-on-surface-variant">
            {storageProvider.startsWith("S3")
              ? "Los adjuntos se guardan en el bucket S3/R2 configurado."
              : "Los adjuntos se guardan en disco local (public/uploads). Para producción configurar STORAGE_PROVIDER=s3 (ver F5-09)."}
          </p>
        </Card>

        <Card title={`Últimos snapshots de pricing (${withSnapshot.length})`}>
          {withSnapshot.length === 0 && (
            <p className="text-sm text-on-surface-variant">
              Sin cotizaciones confirmadas todavía. Cada confirmación guarda un snapshot inmutable en el pedido.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {withSnapshot.map((s) => (
              <li key={s.number} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">Pedido #{s.number}</span>
                <span className="text-on-surface-variant">
                  {s.snapshot!.rule.name} · generada {formatDateTime(s.snapshot!.generatedAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
