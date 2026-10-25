import Link from "next/link";
import { Clock, Instagram, MapPin, MessageCircle } from "lucide-react";

import { getPublicBusinessInfo, PUBLIC_NAV, SITE_NAME } from "@/lib/public/site";
import { Logo } from "./Logo";

/**
 * Pie público: marca, navegación y datos de contacto reales del negocio
 * (`settings` → getBusinessInfo). Cada línea de contacto se omite cuando el
 * negocio no la configuró — el footer nunca inventa datos.
 */
export async function SiteFooter() {
  const business = await getPublicBusinessInfo();
  const year = new Date().getFullYear();
  const instagram = business.instagram;
  const whatsapp = business.whatsappPhone;

  return (
    <footer className="texture-grain bg-navy-950 text-on-navy-variant">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1.2fr]">
        <div>
          <Logo onDark />
          <p className="mt-5 max-w-xs text-sm leading-6">
            {business.description ||
              "Indumentaria deportiva sublimada, diseñada y producida en Formosa para clubes, colegios y equipos de todo el país."}
          </p>
          {instagram ? (
            <a
              href={`https://instagram.com/${instagram}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md border border-navy-line px-4 text-sm font-medium text-on-navy transition-colors hover:border-navy-400 hover:bg-navy-800"
            >
              <Instagram className="h-4 w-4" aria-hidden />
              @{instagram}
            </a>
          ) : null}
        </div>

        <nav aria-label="Explorar el sitio">
          <h2 className="label-caps text-on-navy">Explorar</h2>
          <ul className="mt-5 space-y-3 text-sm">
            <li>
              <Link href="/" className="transition-colors hover:text-on-navy">
                Inicio
              </Link>
            </li>
            {PUBLIC_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="transition-colors hover:text-on-navy">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/login" className="transition-colors hover:text-on-navy">
                Acceso interno
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="label-caps text-on-navy">Contacto</h2>
          <ul className="mt-5 space-y-4 text-sm">
            <li className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span>{business.address || "Formosa, Argentina"}</span>
            </li>
            {whatsapp ? (
              <li className="flex items-start gap-3">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <a
                  href={`https://wa.me/${whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-on-navy"
                >
                  {business.phoneDisplay || "Escribinos por WhatsApp"}
                </a>
              </li>
            ) : null}
            {business.hours ? (
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <span>{business.hours}</span>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="border-t border-navy-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>
            © {year} {SITE_NAME} · Todos los derechos reservados
          </span>
          <span>Hecho en Formosa, Argentina</span>
        </div>
      </div>
    </footer>
  );
}
