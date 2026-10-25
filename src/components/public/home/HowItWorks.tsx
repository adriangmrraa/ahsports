import Link from "next/link";
import { ArrowRight } from "lucide-react";

const STEPS = [
  {
    number: "01",
    title: "Contanos tu idea",
    description:
      "Completás el presupuesto en 5 pasos: producto, talles, cantidades, archivos y datos de contacto. Sin vueltas.",
  },
  {
    number: "02",
    title: "Recibí tu propuesta",
    description:
      "Te devolvemos un presupuesto claro con diseño incluido. Revisamos juntos el arte antes de producir.",
  },
  {
    number: "03",
    title: "Producimos y seguís todo",
    description:
      "Con la seña del 50% arranca la producción. Seguís cada etapa desde el link de seguimiento de tu pedido.",
  },
];

/**
 * "Cómo trabajamos": 3 pasos numerados con entrada escalonada CSS.
 */
export function HowItWorks() {
  return (
    <section
      aria-labelledby="how-title"
      className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24"
    >
      <div className="mb-10 max-w-2xl animate-fade-up">
        <p className="label-caps mb-3 text-primary">Cómo trabajamos</p>
        <h2
          id="how-title"
          className="text-3xl font-extrabold tracking-tight sm:text-4xl"
        >
          De la idea a la cancha en tres pasos.
        </h2>
      </div>

      <ol className="stagger-in grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.number}
            className="hover-lift relative rounded-2xl border border-outline-variant bg-surface-container p-6 sm:p-7"
          >
            <span className="font-display text-5xl font-black text-navy-200">
              {step.number}
            </span>
            <h3 className="mt-6 text-xl font-bold">{step.title}</h3>
            <p className="mt-3 text-sm leading-6 text-on-surface-variant">
              {step.description}
            </p>
            {index === 0 ? (
              <Link
                href="/presupuesto"
                className="label-caps mt-5 inline-flex items-center gap-1.5 text-primary hover:text-navy-600"
              >
                Empezar ahora
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
