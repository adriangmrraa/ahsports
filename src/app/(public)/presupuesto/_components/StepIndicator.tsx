import Link from "next/link";

const STEPS = ["Contacto", "Producto", "Personalización", "Archivos", "Confirmación"];

/** F4-07/13 — indicador de progreso del wizard público de 5 pasos. */
export function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="mx-auto flex w-full max-w-xl items-start justify-between gap-0 text-xs">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <Link
              href={`/presupuesto/${n}`}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                active
                  ? "border-primary bg-primary text-on-primary"
                  : done
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-outline-variant bg-surface-container text-on-surface-variant"
              }`}
              aria-label={`Paso ${n}: ${label}`}
              aria-current={active ? "step" : undefined}
            >
              {done ? "✓" : n}
            </Link>
            <span className={`hidden sm:block ${active ? "text-primary" : "text-on-surface-variant"}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
