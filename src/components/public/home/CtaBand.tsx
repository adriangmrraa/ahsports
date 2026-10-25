import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";

/**
 * Banda final de conversión: navy + mesh, CTA ámbar al wizard y
 * alternativa de WhatsApp cuando el negocio configuró número.
 */
export function CtaBand({ whatsappPhone }: { whatsappPhone: string }) {
  return (
    <section className="relative overflow-hidden bg-navy-950 text-on-navy">
      <div aria-hidden className="texture-mesh absolute inset-0" />
      <div aria-hidden className="texture-grain absolute inset-0" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-4 py-16 text-center sm:px-6 sm:py-24">
        <div className="animate-fade-up max-w-2xl">
          <p className="label-caps mb-4 text-accent">¿Listos para arrancar?</p>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            Vestí a tu equipo con algo que los represente.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-on-navy-variant">
            Completá el presupuesto en menos de 5 minutos. Te devolvemos una
            propuesta clara, con diseño incluido.
          </p>
        </div>

        <div className="animate-fade-up flex flex-col items-center gap-3 sm:flex-row" style={{ animationDelay: "120ms" }}>
          <Link
            href="/presupuesto"
            className="label-caps inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-accent px-6 text-sm text-on-accent transition-colors hover:bg-accent-strong"
          >
            Empezar presupuesto
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          {whatsappPhone ? (
            <a
              href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent("Hola, quiero consultar por indumentaria para mi equipo.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="label-caps inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-navy-line px-6 text-sm text-on-navy transition-colors hover:border-navy-300 hover:bg-navy-800"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              Escribinos por WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
