import { notFound } from "next/navigation";
import { BadgeCheck, Check, ClipboardCheck, PackageCheck, Scissors, Send } from "lucide-react";
import { getBusinessInfo } from "@/lib/business";
import { checkPublicGetRateLimit } from "@/lib/infra/public-rate-limit";
import { formatARS } from "@/lib/public/format";
import { loadPublicTracking, type PublicTrackingLine } from "@/lib/public/tracking";
import { WhatsAppCta } from "@/components/WhatsAppCta";

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
        <span key={label} className="rounded-full bg-surface-container-high px-2.5 py-0.5 text-xs text-on-surface-variant">
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
    <ul className="mt-1 flex flex-col gap-0.5">
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
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Demasiadas solicitudes</h1>
        <p className="mt-2 text-sm text-on-surface-variant">Probá de nuevo en un minuto.</p>
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
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-2 text-balance text-xl font-bold tracking-tight sm:text-2xl">Seguimiento de pedido</h1>
      <p className="mb-6 text-sm text-on-surface-variant">Pedido #{order.number}</p>

      {/* Estado actual */}
      <div className="mb-6 rounded-2xl border border-outline-variant bg-surface-container p-4 sm:p-5 animate-rise">
        <span
          className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
            cancelled
              ? "bg-status-danger/15 text-status-danger"
              : order.status === "entregado"
                ? "bg-status-success/15 text-status-success"
                : "bg-primary/20 px-3 py-1 text-primary"
          }`}
        >
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
        <p className="mt-2 text-sm text-on-surface-variant">
          Solicitado el {new Date(order.createdAt).toLocaleDateString("es-AR")}
        </p>
        {order.status === "bloqueado_pago" && (
          <p className="mt-3 rounded-lg bg-status-warning/15 px-3 py-2 text-sm text-status-warning">⚠️ Falta el pago de la seña para iniciar la producción.</p>
        )}
      </div>

      {/* Timeline */}
      {!cancelled && (
        <div className="relative mb-6">
          <div aria-hidden className="absolute inset-x-[10%] top-[17px] h-0.5 overflow-hidden rounded-full bg-surface-container-highest">
            <div
              className="h-full bg-primary transition-all duration-700"
              style={{ width: `${(stage / (TIMELINE.length - 1)) * 100}%` }}
            />
          </div>
          <ol className="relative grid grid-cols-5 gap-1">
            {TIMELINE.map((step, i) => {
              const Icon = step.icon;
              const done = i < stage;
              const active = i === stage;
              return (
                <li key={step.label} className="flex min-w-0 flex-col items-center gap-1.5 text-center animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
                  <span
                    className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-300 ${
                      done
                        ? "border-primary bg-primary text-on-primary"
                        : active
                          ? "border-primary bg-surface-container text-primary ring-4 ring-primary/15 scale-110"
                          : "border-outline-variant bg-surface-container text-on-surface-variant"
                    }`}
                    aria-current={active ? "step" : undefined}
                  >
                    {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className={`text-[10px] leading-tight ${i <= stage ? "font-medium text-primary" : "text-on-surface-variant"}`}>{step.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Detalle del pedido + precios */}
      <div className="mb-6 rounded-2xl border border-outline-variant bg-surface-container p-4 sm:p-5 animate-rise" style={{ animationDelay: "120ms" }}>
        <h2 className="label-caps mb-3 text-on-surface-variant">Tu pedido</h2>
        <ul className="flex flex-col gap-3">
          {(hasSnapshot ? snapshotLines : lines).map((line) => {
            if (hasSnapshot) {
              const l = line as NonNullable<typeof snapshot>["lines"][number];
              return (
                <li key={l.orderLineId ?? l.productId} className="border-b border-outline-variant/60 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium">
                      {l.productName} <span className="text-on-surface-variant">×{l.quantity}</span>
                    </p>
                    <p className="text-sm font-semibold">{formatARS(l.subtotal)}</p>
                  </div>
                  {l.sizeBreakdown && l.sizeBreakdown.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {l.sizeBreakdown.map((s, i) => (
                        <li key={s.sizeId ?? i} className="flex items-baseline justify-between gap-3 text-xs text-on-surface-variant">
                          <span>{s.sizeLabel ?? "Único"} · {s.quantity} × {formatARS(s.unitPrice)}</span>
                          <span>{formatARS(s.subtotal)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!l.sizeBreakdown?.length && (
                    <p className="mt-1 text-xs text-on-surface-variant">{formatARS(l.unitPrice)} c/u</p>
                  )}
                </li>
              );
            }
            const l = line as PublicTrackingLine;
            return (
              <li key={l.id} className="border-b border-outline-variant/60 pb-3 last:border-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">
                    {l.productName ?? "Producto"} <span className="text-on-surface-variant">×{l.quantity}</span>
                  </p>
                  {linesPriced && <p className="text-sm font-semibold">{formatARS(l.subtotal)}</p>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
            <div className="mt-3 flex items-baseline justify-between border-t border-outline-variant pt-3">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-xl font-bold">{formatARS(snapshot.totals.price)}</span>
            </div>
            {snapshotAdvance !== null && snapshot.rule.minAdvancePercent > 0 && (
              <div className="mt-1 flex items-baseline justify-between text-sm">
                <span className="text-on-surface-variant">Seña ({snapshot.rule.minAdvancePercent}%)</span>
                <span className="font-medium">{formatARS(snapshotAdvance)}</span>
              </div>
            )}
          </>
        ) : linesPriced ? (
          <div className="mt-3 flex items-baseline justify-between border-t border-outline-variant pt-3">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-xl font-bold">{formatARS(order.totalQuoted)}</span>
          </div>
        ) : (
          <p className="mt-3 border-t border-outline-variant pt-3 text-sm text-on-surface-variant">
            Precio a confirmar — te enviamos el presupuesto por mail o WhatsApp.
          </p>
        )}
      </div>

      {/* Archivos aprobados */}
      {approvedAttachments.length > 0 && (
        <div className="mb-6 animate-rise" style={{ animationDelay: "160ms" }}>
          <h2 className="mb-2 text-sm font-semibold">Archivos aprobados</h2>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3">
            {approvedAttachments.map((a) => (
              <div key={a.id} className="rounded-xl border border-outline-variant bg-surface-container p-2">
                {a.mimeType?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.name} className="h-24 w-full rounded bg-white object-contain" />
                ) : (
                  <div className="flex h-24 items-center justify-center text-xs text-on-surface-variant">{a.name}</div>
                )}
                <p className="mt-1 truncate text-center text-xs">{a.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* C-07 — WhatsApp handoff CTA (hidden when no public phone configured) */}
      <div className="animate-rise" style={{ animationDelay: "200ms" }}>
        <WhatsAppCta
          phone={business.whatsappPhone}
          message={`Hola! Quiero consultar por mi pedido #${order.number}.`}
          className="w-full"
        />
      </div>
    </div>
  );
}
