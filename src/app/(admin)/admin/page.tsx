import Link from "next/link";
import { db } from "@/db/client";
import { orders, payments } from "@/db/schema";
import { and, desc, eq, gte, inArray, sql, sum } from "drizzle-orm";
import { Card, PageHeader, StatCard } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Card";
import { Button, LinkButton } from "@/components/ui/Button";
import { ShoppingCart, Factory, AlertTriangle, Wallet, Plus, ArrowRight, Banknote, Layers, Image as ImageIcon } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const [activeOrders] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(inArray(orders.status, ["aprobado", "seniado", "en_produccion", "corte", "confeccion", "estampado", "control"] as const));

  const [blockedOrders] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.status, "bloqueado_pago"));

  const [pendingReview] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.status, "presupuesto_enviado"));

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [monthBilling] = await db
    .select({ total: sum(payments.amount) })
    .from(payments)
    .where(gte(payments.date, monthStart));

  const recentOrders = await db
    .select()
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .limit(8);

  const productionFunnel = await db
    .select({ status: orders.status, count: sql<number>`count(*)::int` })
    .from(orders)
    .where(inArray(orders.status, ["corte", "confeccion", "estampado", "control"] as const))
    .groupBy(orders.status);

  const statusLabel: Record<string, string> = {
    borrador: "Borrador",
    presupuesto_enviado: "Presupuesto enviado",
    aprobado: "Aprobado",
    seniado: "Señado",
    en_produccion: "En producción",
    corte: "Corte",
    confeccion: "Confección",
    estampado: "Estampado",
    control: "Control",
    entregado: "Entregado",
    cancelado: "Cancelado",
    bloqueado_pago: "Bloqueado (pago)",
  };

  return (
    <>
      <PageHeader
        title="Resumen Operativo"
        subtitle={`Actualizado: ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} · Turno ${new Date().getHours() < 14 ? "Mañana" : "Tarde"}`}
        action={
          <>
            <LinkButton href="/admin/pedidos/nuevo" variant="primary">
              <Plus className="w-4 h-4" /> Nuevo pedido
            </LinkButton>
            <LinkButton href="/admin/pedidos/kanban" variant="secondary">
              <Factory className="w-4 h-4" /> Kanban
            </LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Pedidos activos"
          value={activeOrders?.count ?? 0}
          icon={<ShoppingCart className="w-4 h-4" />}
          delta={<span>+0 desde ayer</span>}
        />
        <StatCard
          label="Bloqueados (pago)"
          value={blockedOrders?.count ?? 0}
          tone="secondary"
          icon={<AlertTriangle className="w-4 h-4" />}
          delta={<span>Requiere acción</span>}
        />
        <StatCard
          label="Pendientes de aprobación"
          value={pendingReview?.count ?? 0}
          tone="tertiary"
          icon={<Wallet className="w-4 h-4" />}
          delta={<span>Esperando cliente</span>}
        />
        <StatCard
          label="Facturación del mes"
          value={formatCurrency(Number(monthBilling?.total ?? 0))}
          tone="primary"
          icon={<Banknote className="w-4 h-4" />}
          delta={<span>ARS · cobros confirmados</span>}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
        <Card title="Embudo de producción" className="md:col-span-8">
          <div className="space-y-4">
            {(["corte", "confeccion", "estampado", "control"] as const).map((stage, idx) => {
              const found = productionFunnel.find((p) => p.status === stage);
              const count = found?.count ?? 0;
              const total = productionFunnel.reduce((acc, p) => acc + p.count, 0) || 1;
              const pct = Math.max(8, Math.round((count / total) * 100));
              const colors = ["bg-primary/80", "bg-secondary/80", "bg-tertiary/80", "bg-success/80"];
              return (
                <div key={stage} className="flex items-center gap-3">
                  <div className="w-32 label-caps text-on-surface-variant text-right">{statusLabel[stage]} ({count})</div>
                  <div className="flex-1 h-9 bg-surface-container-highest rounded-full overflow-hidden border border-outline-variant">
                    <div
                      className={`h-full ${colors[idx]} flex items-center px-3 transition-all duration-1000`}
                      style={{ width: `${pct}%` }}
                    >
                      <span className="data-mono text-on-primary-fixed">En proceso</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="md:col-span-4 space-y-3">
          <h3 className="font-headline text-lg text-on-surface">Alertas críticas</h3>
          {blockedOrders && blockedOrders.count > 0 ? (
            <div className="glass-panel rounded-lg p-4 border-l-4 border-l-error flex gap-3 items-start">
              <AlertTriangle className="w-4 h-4 text-error mt-0.5" />
              <div>
                <p className="label-caps text-on-surface mb-1">Pedidos sin seña</p>
                <p className="text-xs text-on-surface-variant mb-2">{blockedOrders.count} pedido(s) bloqueado(s) por falta de pago.</p>
                <Link href="/admin/pedidos/bloqueados" className="label-caps text-error hover:underline">Gestionar →</Link>
              </div>
            </div>
          ) : (
            <div className="glass-panel rounded-lg p-4 text-center text-on-surface-variant text-sm">Sin alertas críticas.</div>
          )}
          {pendingReview && pendingReview.count > 0 ? (
            <div className="glass-panel rounded-lg p-4 border-l-4 border-l-tertiary flex gap-3 items-start">
              <ImageIcon className="w-4 h-4 text-tertiary mt-0.5" />
              <div>
                <p className="label-caps text-on-surface mb-1">Presupuestos sin aprobar</p>
                <p className="text-xs text-on-surface-variant mb-2">{pendingReview.count} esperando confirmación del cliente.</p>
                <Link href="/admin/pedidos?status=presupuesto_enviado" className="label-caps text-tertiary hover:underline">Ver →</Link>
              </div>
            </div>
          ) : null}
          <Link href="/admin/recetas" className="glass-panel rounded-lg p-4 flex items-center gap-3 hover:border-primary transition-colors">
            <Layers className="w-4 h-4 text-primary" />
            <div className="flex-1">
              <p className="text-sm text-on-surface">Configurar recetas</p>
              <p className="text-xs text-on-surface-variant">BOM, materiales y márgenes</p>
            </div>
            <ArrowRight className="w-4 h-4 text-on-surface-variant" />
          </Link>
        </div>
      </div>

      <Card title="Actividad reciente" action={<Link href="/admin/pedidos" className="label-caps text-primary hover:text-primary-fixed">Ver todos</Link>}>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-6 text-center">Sin pedidos aún. <Link href="/admin/pedidos/nuevo" className="text-primary hover:underline">Crear el primero</Link>.</p>
        ) : (
          <div className="space-y-2">
            {recentOrders.map((o) => {
              const tone =
                o.status === "bloqueado_pago" ? "error" :
                o.status === "presupuesto_enviado" ? "tertiary" :
                ["aprobado", "seniado", "en_produccion", "corte", "confeccion", "estampado"].includes(o.status) ? "primary" :
                o.status === "entregado" ? "success" :
                "muted";
              return (
                <Link key={o.id} href={`/admin/pedidos/${o.id}`} className="flex items-center justify-between p-3 rounded hover:bg-surface-bright/5 transition-colors border border-transparent hover:border-outline-variant">
                  <div className="flex items-center gap-3">
                    <span className="text-primary data-mono">#{o.number}</span>
                    <span className="text-sm text-on-surface truncate max-w-xs">{o.notes?.split("\n")[0] || "Pedido"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={tone as never}>{statusLabel[o.status]}</Badge>
                    <span className="data-mono text-on-surface-variant">{formatCurrency(o.totalQuoted)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}