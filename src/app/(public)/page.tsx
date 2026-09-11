import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";

const services = [
  ["Equipos completos", "Camisetas, shorts y conjuntos pensados para competir y durar."],
  ["Personalización", "Nombres, números, escudos y sponsors integrados al diseño."],
  ["Acompañamiento", "Un pedido claro desde la primera idea hasta la entrega."],
];

const sizes = [
  ["Infantil", "6", "8", "10", "12", "14", "16"],
  ["Adulto", "XS", "S", "M", "L", "XL", "XXL"],
];

const steps = [
  ["01", "Nos contás el proyecto", "Definimos equipo, cantidad, diseño y fecha."],
  ["02", "Recibís una propuesta", "Ordenamos talles, personalización y presupuesto."],
  ["03", "Producimos y entregamos", "Acompañamos el avance hasta que el pedido esté listo."],
];

export default function PublicLanding() {
  return (
    <>
      <section className="border-b border-outline-variant">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="label-caps mb-5 text-primary">Indumentaria deportiva · Formosa</p>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
              Equipos que se ven bien. <span className="text-primary">Pedidos que avanzan.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-on-surface-variant sm:text-lg">
              Diseñamos y producimos indumentaria para clubes, colegios y organizaciones. Te ayudamos a ordenar cada detalle sin perder de vista lo importante: salir a jugar.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <LinkButton href="/presupuesto" size="lg">Pedir presupuesto →</LinkButton>
              <LinkButton href="/seguimiento" variant="secondary" size="lg">Seguir un pedido</LinkButton>
            </div>
          </div>
          <div className="border-l-2 border-primary pl-5 text-sm leading-6 text-on-surface-variant lg:mb-2">
            <p className="label-caps mb-3 text-on-surface">Hecho para equipos reales</p>
            <p>Una forma simple de pasar de la idea a la prenda terminada, con información clara en cada paso.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="services-title" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="mb-8 max-w-xl">
          <p className="label-caps mb-3 text-primary">Qué hacemos</p>
          <h2 id="services-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">Una solución completa para vestir a tu equipo.</h2>
        </div>
        <div className="grid border-y border-outline-variant md:grid-cols-3">
          {services.map(([title, description], index) => (
            <article key={title} className={`py-6 md:px-6 ${index > 0 ? "border-t border-outline-variant md:border-l md:border-t-0" : ""}`}>
              <span className="data-mono text-primary">0{index + 1}</span>
              <h3 className="mt-8 text-xl font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-on-surface-variant">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="sizes-title" className="border-y border-outline-variant bg-surface-container-low">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="label-caps mb-3 text-primary">Guía rápida</p>
            <h2 id="sizes-title" className="text-3xl font-semibold tracking-tight">Talles para armar tu pedido.</h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-on-surface-variant">Usá esta referencia para organizar cantidades. En el presupuesto confirmamos la disponibilidad según el producto elegido.</p>
          </div>
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
              <caption className="sr-only">Talles disponibles por grupo</caption>
              <thead>
                <tr className="border-b border-outline-variant text-on-surface-variant">
                  <th className="py-3 pr-5 font-medium">Grupo</th>
                  {sizes[0].slice(1).map((size) => <th key={size} className="px-3 py-3 text-center font-medium">{size}</th>)}
                </tr>
              </thead>
              <tbody>
                {sizes.map((row) => (
                  <tr key={row[0]} className="border-b border-outline-variant last:border-0">
                    <th className="py-4 pr-5 font-medium text-on-surface">{row[0]}</th>
                    {row.slice(1).map((size) => <td key={size} className="px-3 py-4 text-center text-on-surface-variant">{size}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-labelledby="process-title" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="mb-8 max-w-xl">
          <p className="label-caps mb-3 text-primary">Cómo trabajamos</p>
          <h2 id="process-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">Claridad antes, durante y después.</h2>
        </div>
        <ol className="grid border-y border-outline-variant md:grid-cols-3">
          {steps.map(([number, title, description], index) => (
            <li key={number} className={`py-6 md:px-6 ${index > 0 ? "border-t border-outline-variant md:border-l md:border-t-0" : ""}`}>
              <span className="data-mono text-primary">{number}</span>
              <h3 className="mt-8 text-lg font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-on-surface-variant">{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-outline-variant bg-surface-container-low">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6 sm:py-16 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="label-caps mb-3 text-primary">¿Listos para arrancar?</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Contanos qué necesita tu equipo.</h2>
          </div>
          <Link href="/presupuesto" className="label-caps inline-flex min-h-11 items-center justify-center rounded-md bg-primary-container px-5 py-3 text-on-primary-container hover:bg-primary hover:text-on-primary">Empezar presupuesto →</Link>
        </div>
      </section>
    </>
  );
}
