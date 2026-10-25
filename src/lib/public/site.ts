import { cache } from "react";

import { getBusinessInfo, type BusinessInfo } from "@/lib/business";

/**
 * Constantes y helpers compartidos del sitio público (header, footer,
 * sitemap, SEO). Solo lectura — la fuente de verdad del negocio vive en
 * `settings` vía getBusinessInfo().
 */

export const SITE_NAME = "AH Sports";
export const SITE_TAGLINE = "Indumentaria deportiva personalizada";

/**
 * Base absoluta para canonical/OG/sitemap. NEXT_PUBLIC_SITE_URL gana en
 * producción si está configurada; el fallback es el deploy conocido de
 * Render (docs/07-DEPLOYMENT.md).
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://ah-sports-os.onrender.com";

export const PUBLIC_NAV = [
  { href: "/catalogo", label: "Catálogo" },
  { href: "/presupuesto", label: "Presupuesto" },
  { href: "/seguimiento", label: "Seguimiento" },
] as const;

/**
 * getBusinessInfo deduplicada por request: layout, footer y JSON-LD de la
 * home consultan la misma identidad sin repetir la lectura de settings.
 */
export const getPublicBusinessInfo: () => Promise<BusinessInfo> =
  cache(getBusinessInfo);
