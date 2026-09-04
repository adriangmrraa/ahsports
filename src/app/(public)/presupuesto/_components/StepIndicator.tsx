import Link from "next/link";

const STEPS = ["Contacto", "Producto", "Personalización", "Archivos", "Confirmación"];

/** F4-07/13 — indicador de progreso del wizard público de 5 pasos. */
export function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="mx-auto flex max-w-xl items-center justify-between gap-1 text-xs">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex flex-1 flex-col items-center gap-1">
            <Link
              href={`/presupuesto/${n}`}
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition ${
                active
                  ? "border-primary bg-primary text-on-primary"
                  : done
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-outline-variant bg-surface-container text-on-surface-variant"
              }`}
              aria-label={`Paso ${n}: ${label}`}
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