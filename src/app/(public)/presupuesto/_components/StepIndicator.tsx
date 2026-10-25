import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Contacto", "Producto", "Personalización", "Archivos", "Confirmación"];

/**
 * F4-07/13 — indicador de progreso del wizard público de 5 pasos.
 * Variante navy para la banda hero de cada paso: track + fill ámbar, pasos
 * hechos con tilde ámbar, activo anillado. Sigue siendo navegable con Link.
 */
export function StepIndicator({ current }: { current: number }) {
  const progress = Math.max(0, Math.min(1, (current - 1) / (STEPS.length - 1)));

  return (
    <div className="relative mt-8 animate-fade-up" style={{ animationDelay: "200ms" }}>
      {/* Track de progreso detrás de los círculos */}
      <div aria-hidden className="absolute inset-x-[10%] top-[18px] h-0.5 rounded-full bg-navy-line">
        <div
          className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <ol className="relative grid grid-cols-5 gap-1">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          return (
            <li key={label} className="flex min-w-0 flex-col items-center gap-2">
              <Link
                href={`/presupuesto/${n}`}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-display text-xs font-bold transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
                  done && "border-accent bg-accent text-on-accent",
                  active && "scale-110 border-accent bg-navy-900 text-accent ring-4 ring-accent/20",
                  !done && !active && "border-navy-line bg-navy-900/80 text-on-navy-variant hover:border-navy-300 hover:text-on-navy",
                )}
                aria-label={`Paso ${n}: ${label}`}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="h-4 w-4" aria-hidden /> : n}
              </Link>
              <span
                className={cn(
                  "hidden text-center text-[11px] leading-tight sm:block",
                  active ? "font-semibold text-accent" : done ? "text-on-navy-variant" : "text-on-navy-variant/60",
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
