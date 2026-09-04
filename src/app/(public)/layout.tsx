import Link from "next/link";

/**
 * (public) layout — experiencia pública (landing, presupuesto 5 pasos, seguimiento).
 * F4-07. Sin sidebar de admin: header simple con logo/nombre + footer mínimo.
 * El root layout (src/app/layout.tsx) ya aporta <html>/<body> + fuentes.
 * Usa CSS vars semánticas (bg-surface-container, text-on-surface) — cero hex.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface text-on-surface">
      <header className="sticky top-0 z-20 border-b border-outline-variant bg-surface-container/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">
              AH<span className="text-primary"> Sports</span>
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-on-surface-variant">
            <Link href="/presupuesto" className="transition hover:text-on-surface">
              Pedir presupuesto
            </Link>
            <Link href="/seguimiento" className="transition hover:text-on-surface">
              Seguimiento
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-outline-variant py-6 text-center text-xs text-on-surface-variant">
        AH Sports — Taller de indumentaria deportiva · Formosa, Argentina
      </footer>
    </div>
  );
}