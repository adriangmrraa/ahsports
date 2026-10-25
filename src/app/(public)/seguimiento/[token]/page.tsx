import { notFound } from "next/navigation";
import { BadgeCheck, Check, ClipboardCheck, PackageCheck, Scissors, Send, TimerOff } from "lucide-react";
import { getBusinessInfo } from "@/lib/business";
import { checkPublicGetRateLimit } from "@/lib/infra/public-rate-limit";
import { formatARS } from "@/lib/public/format";
import { loadPublicTracking, type PublicTrackingLine } from "@/lib/public/tracking";
import { WhatsAppCta } from "@/components/WhatsAppCta";
import { PageHero } from "@/components/public/PageHero";
import { cn } from "@/lib/utils";

export const metadata = { title: "Seguimiento · AH Sports" };

const STATUS_LABEL: Record<string, string> = {
  borrador: "Borrador",
  presupuesto_enviado: "Presupuesto enviado",
  aprobado: "Aprobado",
  seniado: "Señado",
  en_produccion: "En producción",
  corte: "Corte / Tizada",
  confeccion: "Confección",
  estampado: "Estampado",
  control: "Control de calidad",
  entregado: "Entregado",
  cancelado: "Cancelado",
  bloqueado_pago: "Bloqueado por pago",
};

const TIMELINE = [
  { label: "Presupuesto", icon: Send },
  { label: "Aprobado / Señado", icon: BadgeCheck },
  { label: "Producción", icon: Scissors },
  { label: "Control", icon: ClipboardCheck },
  { label: "Entregado", icon: PackageCheck },
];

/** Compact size×qty chips for an order line's garments. */
function SizeChips({ line }: { line: PublicTrackingLine }) {
  const bySize = new Map<string, number>();
  for (const item of line.items) {
    const label = item.sizeLabel ?? "Único";
    bySize.set(label, (bySize.get(label) ?? 0) + 1);
  }
  if (bySize.size === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {[...bySize.entries()].map(([label, count]) => (
        <span key={label} className="rounded-full bg-navy-100 px-2.5 py-0.5 text-xs font-semibold text-navy-700">
          {label} ×{count}
        </span>
      ))}
    </span>
  );
}

/** Personalized garments (name/number) under a line — only those carrying data. */
function PersonalizedItems({ line }: { line: PublicTrackingLine }) {
  const personalized = line.items.filter((i) => i.individualName || i.individualNumber);
  if (personalized.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-col gap-0.5">
      {personalized.slice(0, 30).map((item) => (
        <li key={item.id} className="text-xs text-on-surface-variant">
          {[item.sizeLabel, item.individualName, item.individualNumber && `#${item.individualNumber}`]
            .filter(Boolean)
            .join(" · ")}
        </li>
      ))}
      {personalized.length > 30 && (
        <li className="text-xs text-on-surface-variant">…y {personalized.length - 30} más</li>
      )}
    </ul>
  );
}

/**
 * F4-14 — /seguimiento/[token]: vista pública de seguimiento para el cliente.
 * Sin auth; busca por publicToken. NO expone costos internos ni pagos: del
 * snapshot solo se renderizan precios unitarios, subtotales y el total.
 */
export default async function SeguimientoPage({ params }: { params: Promise<{ token: string }> }) {
  // G-02 — public GET limit, isolated bucket (token probing flood stops here).
  const rate = await checkPublicGetRateLimit("public:seguimiento", {
    limit: 30,
    bucketLimit: 300,
  });
  if (!rate.success) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-100 text-navy-700">
          <TimerOff className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </span>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Demasiadas solicitudes</h1>
        <p className="text-sm text-on-surface-variant">Probá de nuevo en un minuto.</p>
      </div>
    );
  }

  const { token } = await params;
  const data = await loadPublicTracking(token);
  if (!data) notFound();
  const { order, lines, approvedAttachments } = data;

  // Etapa de la timeline según el estado.
  let stage = 0;
  if (["aprobado", "seniado", "presupuesto_enviado", "bloqueado_pago"].includes(order.status)) stage = 1;
  else if (["en_produccion", "corte", "confeccion", "estampado"].includes(order.status)) stage = 2;
  else if (["control"].includes(order.status)) stage = 3;
  else if (order.status === "entregado") stage = 4;

  const cancelled = order.status === "cancelado";
  const delivered = order.status === "entregado";
  const business = await getBusinessInfo();

  // Precios: el snapshot de la cotización es la fuente autorizada; si aún no
  // existe, las líneas cotizadas del pedido; si nada tiene precio, mostramos
  // el detalle con "a confirmar".
  const snapshot = order.snapshot;
  const snapshotLines = snapshot?.lines ?? [];
  const hasSnapshot = snapshotLines.length > 0;
  const linesPriced = !hasSnapshot && lines.some((l) => l.unitPrice > 0);
  const snapshotAdvance =
    snapshot && snapshot.totals.price > 0
      ? (snapshot.totals.price * snapshot.rule.minAdvancePercent) / 100
      : null;

  return (
    <>
      <PageHero
        crumb="Seguimiento"
        eyebrow="Seguimiento online"
        title={
          <>
            Pedido <span className="text-accent">#{order.number}</span>
          </>
        }
        lead={`Solicitado el ${new Date(order.createdAt).toLocaleDateString("es-AR")} — acá ves cada etapa de tu pedido en tiempo real.`}
      >
        <div className="mt-6 flex flex-wrap items-center gap-3 animate-fade-up" style={{ animationDelay: "140ms" }}>
          <span
            className={cn(
              "label-caps inline-flex items-center gap-2 rounded-full border px-4 py-2",
              cancelled
                ? "border-status-danger/50 bg-status-danger/15 text-status-danger"
                : delivered
                  ? "border-status-success/50 bg-status-success/15 text-status-success"
                  : "border-accent/50 bg-accent/15 text-accent",
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {STATUS_LABEL[order.status] ?? order.status}
          </span>
          {order.status === "bloqueado_pago" && (
            <span className="inline-flex items-center rounded-full border border-status-warning/50 bg-status-warning/15 px-4 py-2 text-xs font-medium text-status-warning">
              Falta el pago de la seña para iniciar la producción
            </span>
          )}
        </div>

        {/* Timeline de etapas — sobre navy, fill ámbar */}
        {!cancelled && (
          <div className="relative mt-8 animate-fade-up" style={{ animationDelay: "220ms" }}>
            <div aria-hidden className="absolute inset-x-[10%] top-[18px] h-0.5 rounded-full bg-navy-line">
              <div
                className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
                style={{ width: `${(stage / (TIMELINE.length - 1)) * 100}%` }}
              />
            </div>
            <ol className="relative grid grid-cols-5 gap-1">
              {TIMELINE.map((step, i) => {
                const Icon = step.icon;
                const done = i < stage;
                const active = i === stage;
                return (
                  <li key={step.label} className="flex min-w-0 flex-col items-center gap-2">
                    <span
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-300",
                        done && "border-accent bg-accent text-on-accent",
                        active && "scale-110 border-accent bg-navy-900 text-accent ring-4 ring-accent/20",
                        !done && !active && "border-navy-line bg-navy-900/80 text-on-navy-variant",
                      )}
                      aria-current={active ? "step" : undefined}
                    >
                      {done ? <Check className="h-4 w-4" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
                    </span>
                    <span
                      className={cn(
                        "text-center text-[10px] leading-tight sm:text-[11px]",
                        active ? "font-semibold text-accent" : i <= stage ? "text-on-navy-variant" : "text-on-navy-variant/60",
                      )}
                    >
                      {step.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </PageHero>

      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-12">
        {/* Detalle del pedido + precios */}
        <section className="animate-rise rounded-3xl border border-outline-variant bg-surface-container p-5 sm:p-7" aria-label="Detalle del pedido">
          <h2 className="label-caps flex items-center gap-2 text-on-surface-variant">
            <span className="h-3.5 w-1 rounded-full bg-accent" aria-hidden />
            Tu pedido
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {(hasSnapshot ? snapshotLines : lines).map((line) => {
              if (hasSnapshot) {
                const l = line as NonNullable<typeof snapshot>["lines"][number];
                return (
                  <li key={l.orderLineId ?? l.productId} className="border-b border-outline-variant/60 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold">
                        {l.productName} <span className="text-on-surface-variant">×{l.quantity}</span>
                      </p>
                      <p className="font-display text-base font-bold text-primary">{formatARS(l.subtotal)}</p>
                    </div>
                    {l.sizeBreakdown && l.sizeBreakdown.length > 0 && (
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {l.sizeBreakdown.map((s, i) => (
                          <li key={s.sizeId ?? i} className="flex items-baseline justify-between gap-3 text-xs text-on-surface-variant">
                            <span>{s.sizeLabel ?? "Único"} · {s.quantity} × {formatARS(s.unitPrice)}</span>
                            <span>{formatARS(s.subtotal)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!l.sizeBreakdown?.length && (
                      <p className="mt-1.5 text-xs text-on-surface-variant">{formatARS(l.unitPrice)} c/u</p>
                    )}
                  </li>
                );
              }
              const l = line as PublicTrackingLine;
              return (
                <li key={l.id} className="border-b border-outline-variant/60 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold">
                      {l.productName ?? "Producto"} <span className="text-on-surface-variant">×{l.quantity}</span>
                    </p>
                    {linesPriced && <p className="font-display text-base font-bold text-primary">{formatARS(l.subtotal)}</p>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <SizeChips line={l} />
                    {linesPriced && <span className="text-xs text-on-surface-variant">{formatARS(l.unitPrice)} c/u</span>}
                  </div>
                  <PersonalizedItems line={l} />
                </li>
              );
            })}
          </ul>

          {hasSnapshot && snapshot ? (
            <>
              <div className="mt-4 flex items-baseline justify-between border-t border-outline-variant pt-4">
                <span className="label-caps text-on-surface-variant">Total</span>
                <span className="font-display text-2xl font-black tracking-tight text-primary">{formatARS(snapshot.totals.price)}</span>
              </div>
              {snapshotAdvance !== null && snapshot.rule.minAdvancePercent > 0 && (
                <div className="mt-1.5 flex items-baseline justify-between text-sm">
                  <span className="text-on-surface-variant">Seña ({snapshot.rule.minAdvancePercent}%)</span>
                  <span className="font-semibold">{formatARS(snapshotAdvance)}</span>
                </div>
              )}
            </>
          ) : linesPriced ? (
            <div className="mt-4 flex items-baseline justify-between border-t border-outline-variant pt-4">
              <span className="label-caps text-on-surface-variant">Total</span>
              <span className="font-display text-2xl font-black tracking-tight text-primary">{formatARS(order.totalQuoted)}</span>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-status-warning/40 bg-status-warning/10 px-4 py-3.5">
              <p className="text-sm font-medium text-status-warning">
                Precio a confirmar — te enviamos el presupuesto por mail o WhatsApp.
              </p>
            </div>
          )}
        </section>

        {/* Archivos aprobados */}
        {approvedAttachments.length > 0 && (
          <div className="mt-8 animate-rise" style={{ animationDelay: "120ms" }}>
            <h2 className="label-caps mb-4 flex items-center gap-2 text-on-surface-variant">
              <span className="h-3.5 w-1 rounded-full bg-accent" aria-hidden />
              Archivos aprobados
            </h2>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3">
              {approvedAttachments.map((a) => (
                <div key={a.id} className="hover-lift rounded-2xl border border-outline-variant bg-surface-container p-2.5">
                  {a.mimeType?.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt={a.name} className="h-24 w-full rounded-lg bg-white object-contain" />
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-lg bg-surface-container-high text-xs text-on-surface-variant">{a.name}</div>
                  )}
                  <p className="mt-1.5 truncate text-center text-xs">{a.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* C-07 — WhatsApp handoff CTA (hidden when no public phone configured) */}
        <div className="mt-8 animate-rise" style={{ animationDelay: "180ms" }}>
          <WhatsAppCta
            phone={business.whatsappPhone}
            message={`Hola! Quiero consultar por mi pedido #${order.number}.`}
            className="w-full"
          />
        </div>
      </div>
    </>
  );
}
