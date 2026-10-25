import Link from "next/link";
import { ArrowRight, Backpack, Briefcase, Package, Shirt } from "lucide-react";

const CATEGORIES = [
  {
    icon: Shirt,
    title: "Camisetas y prendas",
    description: "Remeras, musculosas y camisetas de juego en telas respirables.",
  },
  {
    icon: Package,
    title: "Conjuntos completos",
    description: "Camiseta + short coordinados, listos para salir a jugar.",
  },
  {
    icon: Backpack,
    title: "Mochilas infantiles",
    description: "Para el cole y el club, con el escudo de tu institución.",
  },
  {
    icon: Briefcase,
    title: "Bolsos deportivos",
    description: "Para llevar el equipo completo, personalizados a medida.",
  },
];

/**
 * Categorías reales del catálogo (misma taxonomía que /catalogo).
 * Cada card lleva al catálogo para explorar productos concretos.
 */
export function Categories() {
  return (
    <section
      aria-labelledby="categories-title"
      className="border-y border-outline-variant bg-surface-container-low"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mb-10 flex flex-col gap-6 animate-fade-up md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="label-caps mb-3 text-primary">Catálogo</p>
            <h2
              id="categories-title"
              className="text-3xl font-extrabold tracking-tight sm:text-4xl"
            >
              Todo lo que tu equipo necesita.
            </h2>
            <p className="mt-4 text-base leading-7 text-on-surface-variant">
              Productos pensados para pedidos por cantidad: clubes, colegios,
              egresados e instituciones.
            </p>
          </div>
          <Link
            href="/catalogo"
            className="label-caps inline-flex shrink-0 items-center gap-1.5 text-primary hover:text-navy-600"
          >
            Ver todo el catálogo
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        <div className="stagger-in grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map(({ icon: Icon, title, description }) => (
            <Link
              key={title}
              href="/catalogo"
              className="hover-lift group rounded-2xl border border-outline-variant bg-surface-container p-6"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-100 text-navy-700 transition-colors group-hover:bg-primary group-hover:text-accent">
                <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
              </span>
              <h3 className="mt-5 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-on-surface-variant">
                {description}
              </p>
              <span className="label-caps mt-4 inline-flex items-center gap-1.5 text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Explorar
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
