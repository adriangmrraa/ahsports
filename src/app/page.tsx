import Link from "next/link";
import { ArrowRight, Layers, ShieldCheck, Zap, Factory } from "lucide-react";

export default function PublicLanding() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 md:px-12 py-6 flex justify-between items-center border-b border-outline-variant">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/20 flex items-center justify-center border border-primary/50">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <span className="font-headline text-xl text-primary">AH Sports</span>
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/presupuesto" className="label-caps text-on-surface-variant hover:text-primary">Pedir presupuesto</Link>
          <Link href="/login" className="px-4 py-2 bg-gradient-to-r from-primary-container to-cyan-700 rounded-md label-caps text-white">Ingresar</Link>
        </nav>
      </header>

      <main className="flex-1 flex items-center px-6 md:px-12">
        <div className="max-w-4xl py-20">
          <p className="label-caps text-primary mb-4">Industrial · Textile · Apparel</p>
          <h1 className="font-display text-5xl md:text-7xl text-on-surface leading-[1.05] mb-6">
            El <span className="gradient-text">taller</span> opera
            <br />
            con <span className="gradient-text">criterio visible</span>.
          </h1>
          <p className="text-lg text-on-surface-variant max-w-2xl mb-10">
            Plataforma operativa de AH Sports: pedidos, producción, costos y trazabilidad. Un sistema que hace
            explícito lo que el taller ya sabe hacer.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/presupuesto"
              className="px-6 py-3 bg-gradient-to-r from-primary-container to-cyan-700 rounded-md label-caps text-white flex items-center gap-2"
            >
              Solicitar presupuesto <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="px-6 py-3 bg-transparent border border-outline-variant rounded-md label-caps text-on-surface hover:border-primary hover:text-primary"
            >
              Panel interno
            </Link>
          </div>
        </div>
      </main>

      <section className="px-6 md:px-12 py-16 border-t border-outline-variant">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-6xl">
          {[
            { icon: Factory, t: "Producción trazable", d: "Kanban con etapas, ficha técnica, consolidado de materiales por pedido." },
            { icon: ShieldCheck, t: "Adjuntos auditables", d: "Logos, sponsors y artes con versión, estado y aprobación por cliente." },
            { icon: Zap, t: "Cotización repetible", d: "Recetas, BOM, márgenes y reglas de precio configurables. Fotografía del cálculo en cada pedido." },
          ].map((c, i) => {
            const Icon = c.icon;
            return (
              <div key={i} className="glass-panel rounded-lg p-6">
                <Icon className="w-6 h-6 text-primary mb-3" />
                <h3 className="font-headline text-lg text-on-surface mb-2">{c.t}</h3>
                <p className="text-sm text-on-surface-variant">{c.d}</p>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="px-6 md:px-12 py-8 border-t border-outline-variant text-center">
        <p className="data-mono text-on-surface-variant">AH Sports · Formosa, Argentina · {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}