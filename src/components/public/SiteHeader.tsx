import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PUBLIC_NAV } from "@/lib/public/site";
import { Logo } from "./Logo";

/**
 * Cabecera pública: navy, sticky, nav de venta + CTA ámbar al wizard.
 * Server component — los estados interactivos se resuelven con CSS.
 * En mobile la nav pasa a una segunda fila para no competir con el CTA.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-navy-line bg-navy-950/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Logo onDark />
        <div className="flex items-center gap-3 sm:gap-5">
          <nav
            aria-label="Navegación pública"
            className="order-3 flex w-full items-center justify-center gap-x-6 border-t border-navy-line pt-3 text-sm sm:order-none sm:w-auto sm:border-0 sm:pt-0"
          >
            {PUBLIC_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="py-1 font-medium text-on-navy-variant transition-colors hover:text-on-navy"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/presupuesto"
            className="label-caps inline-flex min-h-10 items-center gap-1.5 rounded-md bg-accent px-4 text-on-accent transition-colors hover:bg-accent-strong"
          >
            Pedir presupuesto
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
