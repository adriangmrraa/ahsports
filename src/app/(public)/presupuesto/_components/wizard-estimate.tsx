import { formatARS } from "@/lib/public/format";
import type { PublicEstimate } from "@/lib/public/estimate";

/**
 * Compact running estimate shown under the step title (steps 3-4). Server
 * component — the estimate is computed by the page, this only renders it.
 * When the engine cannot quote we say so instead of inventing a number.
 */
export function WizardEstimateChip({ estimate }: { estimate: PublicEstimate | null }) {
  return (
    <div className="mx-auto mb-6 flex w-fit max-w-full items-center gap-2 rounded-full border border-outline-variant bg-surface-container px-4 py-2 text-sm animate-rise">
      {estimate ? (
        <>
          <span className="text-on-surface-variant">Estimado</span>
          <span className="font-semibold">{formatARS(estimate.totalPrice)}</span>
          <span className="text-xs text-on-surface-variant">
            {formatARS(estimate.unitPrice)} c/u · a confirmar
          </span>
        </>
      ) : (
        <span className="text-xs text-on-surface-variant">Precio a confirmar en tu presupuesto</span>
      )}
    </div>
  );
}

/**
 * Full estimated-quote card for step 5: per-size rows, total and the expected
 * seña. Falls back to the product's published basePrice, then to a plain
 * "we'll send it" message — never to an invented number.
 */
export function WizardEstimateCard({
  estimate,
  referencePrice,
}: {
  estimate: PublicEstimate | null;
  referencePrice?: number | string | null;
}) {
  const ref = Number(referencePrice);
  return (
    <section className="mx-auto mb-6 w-full max-w-2xl rounded-2xl border border-outline-variant bg-surface-container p-4 sm:p-6 animate-rise" aria-label="Presupuesto estimado">
      <h2 className="label-caps mb-3 text-on-surface-variant">Tu presupuesto estimado</h2>
      {estimate ? (
        <>
          <ul className="flex flex-col gap-1.5 text-sm">
            {estimate.sizes.length > 0 ? (
              estimate.sizes.map((s, i) => (
                <li key={s.sizeId ?? i} className="flex items-baseline justify-between gap-3">
                  <span className="text-on-surface-variant">
                    {s.sizeLabel ?? "Único"} · {s.quantity} × {formatARS(s.unitPrice)}
                  </span>
                  <span className="font-medium">{formatARS(s.subtotal)}</span>
                </li>
              ))
            ) : (
              <li className="flex items-baseline justify-between gap-3">
                <span className="text-on-surface-variant">
                  {estimate.productName} · {estimate.quantity} × {formatARS(estimate.unitPrice)}
                </span>
                <span className="font-medium">{formatARS(estimate.totalPrice)}</span>
              </li>
            )}
          </ul>
          <div className="mt-3 flex items-baseline justify-between border-t border-outline-variant pt-3">
            <span className="text-sm font-semibold">Total estimado</span>
            <span className="text-xl font-bold">{formatARS(estimate.totalPrice)}</span>
          </div>
          {estimate.advanceAmount !== null && estimate.advancePercent !== null && (
            <div className="mt-1 flex items-baseline justify-between text-sm">
              <span className="text-on-surface-variant">Seña estimada ({estimate.advancePercent}%)</span>
              <span className="font-medium">{formatARS(estimate.advanceAmount)}</span>
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-on-surface-variant">
            Estimado según la cotización actual. El precio final puede variar con diseño, técnica y medidas — se confirma en tu presupuesto.
          </p>
        </>
      ) : ref > 0 ? (
        <p className="text-sm text-on-surface-variant">
          Precio de referencia: <span className="font-semibold text-on-surface">{formatARS(ref)}</span> c/u.
          Te enviamos el presupuesto detallado por mail o WhatsApp.
        </p>
      ) : (
        <p className="text-sm text-on-surface-variant">
          Te enviamos el presupuesto detallado por mail o WhatsApp.
        </p>
      )}
    </section>
  );
}
