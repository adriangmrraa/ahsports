import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { attachments, orders } from "@/db/schema";
import { eq } from "drizzle-orm";

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
  "Presupuesto enviado",
  "Aprobado / Señado",
  "Producción",
  "Control",
  "Entregado",
];

/**
 * F4-14 — /seguimiento/[token]: vista pública de seguimiento para el cliente.
 * Sin auth; busca por publicToken. NO expone costos internos ni pagos.
 */
export default async function SeguimientoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [order] = await db.select().from(orders).where(eq(orders.publicToken, token)).limit(1);
  if (!order) notFound();

  // Etapa de la timeline según el estado.
  let stage = 0;
  if (["aprobado", "seniado", "presupuesto_enviado", "bloqueado_pago"].includes(order.status)) stage = 1;
  else if (["en_produccion", "corte", "confeccion", "estampado"].includes(order.status)) stage = 2;
  else if (["control"].includes(order.status)) stage = 3;
  else if (order.status === "entregado") stage = 4;

  const atts = await db
    .select()
    .from(attachments)
    .where(eq(attachments.orderId, order.id));

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-2 text-balance text-xl font-bold tracking-tight sm:text-2xl">Seguimiento de pedido</h1>
      <p className="mb-6 text-sm text-on-surface-variant">Pedido #{order.number}</p>

      {/* Estado actual */}
      <div className="mb-6 rounded-2xl border border-outline-variant bg-surface-container p-4 sm:p-5">
        <span className="inline-block rounded-full bg-primary/20 px-3 py-1 text-sm font-semibold text-primary">
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
        <p className="mt-2 text-sm text-on-surface-variant">
          Solicitado el {new Date(order.createdAt).toLocaleDateString("es-AR")}
        </p>
        {order.status === "bloqueado_pago" && (
          <p className="mt-3 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-300">⚠️ Falta el pago de la seña para iniciar la producción.</p>
        )}
      </div>

      {/* Timeline */}
      <ol className="mb-6 grid grid-cols-5 gap-1">
        {TIMELINE.map((label, i) => (
          <li key={label} className="flex min-w-0 flex-col items-center gap-1 text-center">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs ${
                i <= stage ? "border-primary bg-primary text-on-primary" : "border-outline-variant bg-surface-container"
              }`}
            >
              {i < stage ? "✓" : i + 1}
            </span>
            <span className={`text-[10px] leading-tight ${i <= stage ? "text-primary" : "text-on-surface-variant"}`}>{label}</span>
          </li>
        ))}
      </ol>

      {/* Archivos aprobados */}
      {atts.filter((a) => a.status === "aprobado").length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">Archivos aprobados</h2>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3">
            {atts
              .filter((a) => a.status === "aprobado")
              .map((a) => (
                <div key={a.id} className="rounded-xl border border-outline-variant bg-surface-container p-2">
                  {a.mimeType?.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt={a.name} className="h-24 w-full rounded object-contain bg-white" />
                  ) : (
                    <div className="flex h-24 items-center justify-center text-xs text-on-surface-variant">{a.name}</div>
                  )}
                  <p className="mt-1 truncate text-center text-xs">{a.name}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
