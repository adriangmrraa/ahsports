import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";

const TRUST_POINTS = ["Diseño incluido", "Seña del 50%", "Seguimiento online"];

/**
 * Hero navy: propuesta de valor + CTA principal al wizard de presupuesto.
 * El panel derecho es una "camiseta" CSS-only (sin imágenes pesadas):
 * stripes + número calado al estilo dorsal.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-navy-950 text-on-navy">
      <div aria-hidden className="texture-mesh absolute inset-0" />
      <div aria-hidden className="texture-grid texture-fade-x absolute inset-0" />
      <div aria-hidden className="texture-grain absolute inset-0" />

      <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="animate-fade-up">
          <p className="label-caps inline-flex items-center gap-2 rounded-full border border-navy-line bg-navy-900/70 px-4 py-2 text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Sublimación full-print · Formosa, Argentina
          </p>

          <h1 className="mt-6 font-display text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            Tu equipo,
            <br />
            <span className="text-accent">con identidad propia.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-7 text-on-navy-variant sm:text-lg sm:leading-8">
            Diseñamos y producimos camisetas, conjuntos y uniformes sublimados
            para clubes, colegios y equipos. Diseño incluido, producción
            propia y un link para seguir tu pedido paso a paso.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/presupuesto"
              className="animate-pulse-cta label-caps inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-accent px-6 text-sm text-on-accent transition-colors hover:bg-accent-strong"
            >
              Pedir presupuesto
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/catalogo"
              className="label-caps inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-navy-line px-6 text-sm text-on-navy transition-colors hover:border-navy-300 hover:bg-navy-800"
            >
              Ver catálogo
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-on-navy-variant">
            {TRUST_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-accent" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="animate-fade-up relative mx-auto w-full max-w-sm lg:max-w-none" style={{ animationDelay: "120ms" }}>
          <div
            aria-hidden
            className="texture-stripes rotate-2 rounded-3xl border border-navy-line bg-navy-800/90 p-6 shadow-2xl shadow-navy-950 backdrop-blur-sm sm:p-8"
          >
            <div className="flex items-center justify-between">
              <span className="label-caps text-on-navy-variant">AH Sports</span>
              <span className="data-mono rounded-full bg-accent/15 px-3 py-1 text-accent">
                Titular
              </span>
            </div>
            <p
              className="mt-8 text-center font-display text-[11rem] font-black leading-none text-transparent sm:text-[13rem]"
              style={{ WebkitTextStroke: "3px var(--color-accent)" }}
            >
              10
            </p>
            <div className="mt-8 flex items-center justify-between border-t border-navy-line pt-4">
              <span className="label-caps text-on-navy-variant">Sublimado</span>
              <span className="label-caps text-accent">Full print</span>
            </div>
          </div>

          <div
            aria-hidden
            className="animate-float absolute -right-3 top-8 rounded-xl border border-navy-line bg-navy-900/95 px-4 py-3 shadow-xl shadow-navy-950 sm:-right-6"
          >
            <p className="label-caps text-accent">Diseño sin cargo</p>
            <p className="mt-1 text-xs text-on-navy-variant">Escudo + nombres + números</p>
          </div>

          <div
            aria-hidden
            className="animate-float absolute -left-3 bottom-10 rounded-xl border border-navy-line bg-navy-900/95 px-4 py-3 shadow-xl shadow-navy-950 sm:-left-6"
            style={{ animationDelay: "1.6s" }}
          >
            <p className="label-caps text-on-navy">Talles 6 a XXL</p>
            <p className="mt-1 text-xs text-on-navy-variant">Infantiles y adultos</p>
          </div>
        </div>
      </div>
    </section>
  );
}
