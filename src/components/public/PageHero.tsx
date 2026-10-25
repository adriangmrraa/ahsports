import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Banda hero navy compartida por las páginas públicas interiores
 * (/catalogo, /presupuesto, /seguimiento). Misma pila de texturas CSS-only
 * que el Hero de home: mesh + grid + grain sobre navy-950.
 * `crumb` rotula la posición actual junto al link de Inicio ("breadcrumb feel").
 */
export function PageHero({
  crumb,
  eyebrow,
  title,
  lead,
  children,
}: {
  /** Etiqueta de la página actual en la ruta (p.ej. "Catálogo"). */
  crumb: string;
  /** Texto de la píldora superior (p.ej. "Presupuesto · Paso 2 de 5"). */
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  /** Slot libre bajo el encabezado: StepIndicator, badges, meta. */
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-navy-950 text-on-navy">
      <div aria-hidden className="texture-mesh absolute inset-0" />
      <div aria-hidden className="texture-grid texture-fade-x absolute inset-0" />
      <div aria-hidden className="texture-grain absolute inset-0" />

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pb-12 sm:pt-14">
        <nav aria-label="Ruta" className="animate-fade-up label-caps flex items-center gap-1.5 text-on-navy-variant">
          <Link href="/" className="transition-colors hover:text-on-navy">
            Inicio
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="text-on-navy">{crumb}</span>
        </nav>

        <div className="mt-6 animate-fade-up" style={{ animationDelay: "60ms" }}>
          <p className="label-caps inline-flex items-center gap-2 rounded-full border border-navy-line bg-navy-900/70 px-4 py-2 text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            {eyebrow}
          </p>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
            {title}
          </h1>
          {lead ? (
            <p className="mt-4 max-w-2xl text-base leading-7 text-on-navy-variant">{lead}</p>
          ) : null}
        </div>

        {children}
      </div>
    </section>
  );
}
