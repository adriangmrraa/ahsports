import { formatARS } from "@/lib/public/format";
import type { PublicEstimate } from "@/lib/public/estimate";

/** "(+ $1.500,00)" / "(− $500,00)" — option sell delta, hidden at zero. */
function optionDeltaLabel(delta: number): string {
  return delta !== 0 ? ` (${delta > 0 ? "+" : "−"} ${formatARS(Math.abs(delta))})` : "";
}

/**
 * Compact running estimate shown under the step title (steps 3-4). Server
 * component — the estimate is computed by the page, this only renders it.
 * When the engine cannot quote we say so instead of inventing a number.
 * Accent pill: el estimado es el dato que vende, se lee sobre navy.
 */
export function WizardEstimateChip({ estimate }: { estimate: PublicEstimate | null }) {
  return (
    <div className="mt-5 w-fit max-w-full animate-fade-up" style={{ animationDelay: "260ms" }}>
      {estimate ? (
        <div className="flex flex-col gap-1.5">
          <div className="inline-flex w-fit max-w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-full bg-accent px-4 py-2 text-sm text-on-accent shadow-lg shadow-navy-950/40">
            <span className="label-caps text-[10px]">Estimado</span>
            <span className="font-display text-base font-extrabold tracking-tight">{formatARS(estimate.totalPrice)}</span>
            <span className="text-xs opacity-80">
              {formatARS(estimate.unitPrice)} c/u · a confirmar
            </span>
          </div>
          {estimate.options && (
            <p className="max-w-md text-[11px] leading-4 text-on-navy-variant">
              {estimate.options.fabricName}
              {estimate.options.methods.length > 0 && ` + ${estimate.options.methods.map((m) => m.techniqueName).join(" + ")}`}
              {estimate.options.volumeTier &&
                ` · Descuento por cantidad: −${estimate.options.discountPercent}% desde ${estimate.options.volumeTier.minQty} unidades`}
            </p>
          )}
        </div>
      ) : (
        <div className="inline-flex items-center rounded-full border border-navy-line bg-navy-900/70 px-4 py-2 text-xs text-on-navy-variant">
          Precio a confirmar en tu presupuesto
        </div>
      )}
    </div>
  );
}

/**
 * Full estimated-quote card for step 5: per-size rows, total and the expected
 * seña. Falls back to the product's published basePrice, then to a plain
 * "we'll send it" message — never to an invented number.
 * Card navy con stripes: es el "ticket" del presupuesto.
 */
export function WizardEstimateCard({
  estimate,
  referencePrice,
}: {
  estimate: PublicEstimate | null;
  referencePrice?: number | string | null;
}) {
  // 0 is a real price — only null/undefined/empty/non-numeric means "no reference".
  const ref =
    referencePrice === null || referencePrice === undefined || referencePrice === ""
      ? NaN
      : Number(referencePrice);
  return (
    <section
      className="texture-stripes relative mb-6 w-full overflow-hidden rounded-3xl border border-navy-line bg-navy-900 p-6 text-on-navy shadow-xl shadow-navy-950/25 animate-rise sm:p-8"
      aria-label="Presupuesto estimado"
    >
      <h2 className="label-caps text-accent">Tu presupuesto estimado</h2>
      {estimate ? (
        <>
          {estimate.options && (
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Opciones elegidas">
              <li className="rounded-full bg-navy-800 px-3 py-1 text-xs font-medium text-on-navy">
                {estimate.options.fabricName}
                {optionDeltaLabel(estimate.options.fabricDelta)}
              </li>
              {estimate.options.methods.map((m) => (
                <li key={m.techniqueId} className="rounded-full bg-navy-800 px-3 py-1 text-xs font-medium text-on-navy">
                  {m.techniqueName}
                  {optionDeltaLabel(m.delta)}
                </li>
              ))}
              {estimate.options.volumeTier && (
                <li className="rounded-full bg-accent/20 px-3 py-1 text-xs font-medium text-accent">
                  Descuento por cantidad: −{estimate.options.discountPercent}% desde {estimate.options.volumeTier.minQty} unidades
                </li>
              )}
            </ul>
          )}
          <ul className="mt-5 flex flex-col gap-2 text-sm">
            {estimate.sizes.length > 0 ? (
              estimate.sizes.map((s, i) => (
                <li key={s.sizeId ?? i} className="flex items-baseline justify-between gap-3">
                  <span className="text-on-navy-variant">
                    {s.sizeLabel ?? "Único"} · {s.quantity} × {formatARS(s.unitPrice)}
                  </span>
                  <span className="font-medium">{formatARS(s.subtotal)}</span>
                </li>
              ))
            ) : (
              <li className="flex items-baseline justify-between gap-3">
                <span className="text-on-navy-variant">
                  {estimate.productName} · {estimate.quantity} × {formatARS(estimate.unitPrice)}
                </span>
                <span className="font-medium">{formatARS(estimate.totalPrice)}</span>
              </li>
            )}
          </ul>
          <div className="mt-5 flex items-baseline justify-between border-t border-navy-line pt-4">
            <span className="label-caps text-on-navy-variant">Total estimado</span>
            <span className="font-display text-3xl font-black tracking-tight text-accent">{formatARS(estimate.totalPrice)}</span>
          </div>
          {estimate.advanceAmount !== null && estimate.advancePercent !== null && (
            <div className="mt-1.5 flex items-baseline justify-between text-sm">
              <span className="text-on-navy-variant">Seña estimada ({estimate.advancePercent}%)</span>
              <span className="font-semibold">{formatARS(estimate.advanceAmount)}</span>
            </div>
          )}
          <p className="mt-4 text-xs leading-5 text-on-navy-variant">
            Estimado según la cotización actual. El precio final puede variar con diseño, técnica y medidas — se confirma en tu presupuesto.
          </p>
        </>
      ) : Number.isFinite(ref) ? (
        <p className="mt-4 text-sm leading-6 text-on-navy-variant">
          Precio de referencia: <span className="font-semibold text-on-navy">{formatARS(ref)}</span> c/u.
          Te enviamos el presupuesto detallado por mail o WhatsApp.
        </p>
      ) : (
        <p className="mt-4 text-sm leading-6 text-on-navy-variant">
          Te enviamos el presupuesto detallado por mail o WhatsApp.
        </p>
      )}
    </section>
  );
}
