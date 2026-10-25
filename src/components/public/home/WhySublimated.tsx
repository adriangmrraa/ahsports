import { Check, X } from "lucide-react";

const GENERIC = [
  "Se cuartea y se despega con los lavados",
  "Pocos colores, diseños limitados",
  "La estampa tapa la respiración de la tela",
  "Cada color extra suma costo",
];

const SUBLIMATED = [
  "El diseño es parte de la tela: no se cuartea ni se despega",
  "Full-print borde a borde, sin límite de colores",
  "La tela sigue respirando como una camiseta de verdad",
  "Nombres, números, escudo y sponsors incluidos en el diseño",
];

/**
 * Posicionamiento: por qué sublimado a medida y no prenda genérica.
 * Comparación directa en dos columnas; la columna navy gana.
 */
export function WhySublimated() {
  return (
    <section
      aria-labelledby="why-title"
      className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24"
    >
      <div className="mb-10 max-w-2xl animate-fade-up">
        <p className="label-caps mb-3 text-primary">Por qué sublimado</p>
        <h2
          id="why-title"
          className="text-3xl font-extrabold tracking-tight sm:text-4xl"
        >
          Una camiseta que dura tanto como tu equipo.
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="animate-fade-up rounded-2xl border border-outline-variant bg-surface-container p-6 sm:p-8">
          <h3 className="label-caps text-on-surface-variant">
            Estampado o vinilo genérico
          </h3>
          <ul className="mt-6 space-y-4 text-sm leading-6 text-on-surface-variant">
            {GENERIC.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <X
                  className="mt-0.5 h-4 w-4 shrink-0 text-status-danger"
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div
          className="animate-fade-up texture-stripes rounded-2xl border border-navy-line bg-navy-900 p-6 text-on-navy sm:p-8"
          style={{ animationDelay: "120ms" }}
        >
          <h3 className="label-caps text-accent">Sublimación AH Sports</h3>
          <ul className="mt-6 space-y-4 text-sm leading-6">
            {SUBLIMATED.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
