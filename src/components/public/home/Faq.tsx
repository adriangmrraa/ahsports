import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    question: "¿Cuál es el pedido mínimo?",
    answer:
      "Depende del producto — el catálogo indica el mínimo de cada uno. En general trabajamos pedidos por cantidad pensados para equipos completos.",
  },
  {
    question: "¿Cómo es el pago?",
    answer:
      "Pedimos una seña del 50% para iniciar la producción y el saldo se abona contra entrega. El presupuesto detalla todo antes de confirmar.",
  },
  {
    question: "¿Puedo ver el diseño antes de que se produzca?",
    answer:
      "Sí. El diseño es parte del proceso: trabajamos el arte con vos y lo revisamos juntos antes de pasar a producción.",
  },
  {
    question: "¿Cuánto tarda un pedido?",
    answer:
      "El plazo depende del producto y la cantidad; lo confirmamos en el presupuesto. Después seguís cada etapa desde el link de seguimiento.",
  },
];

/**
 * FAQ + banda de confianza. <details>/<summary>: acordeón accesible
 * sin JavaScript.
 */
export function Faq() {
  return (
    <section
      aria-labelledby="faq-title"
      className="border-y border-outline-variant bg-surface-container-low"
    >
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="animate-fade-up">
          <p className="label-caps mb-3 text-primary">Preguntas frecuentes</p>
          <h2
            id="faq-title"
            className="text-3xl font-extrabold tracking-tight sm:text-4xl"
          >
            Todo claro antes de pedir.
          </h2>
          <p className="mt-4 max-w-sm text-base leading-7 text-on-surface-variant">
            Nos hacemos cargo: revisamos cada prenda antes de entregarla. Si
            algo sale con defecto de producción, lo resolvemos.
          </p>
        </div>

        <div className="stagger-in space-y-3">
          {FAQS.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-xl border border-outline-variant bg-surface-container px-5 py-4 open:border-primary/30"
            >
              <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                {faq.question}
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-on-surface-variant transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 text-sm leading-6 text-on-surface-variant">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
