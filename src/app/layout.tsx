import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
import "./globals.css";

import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/public/site";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const DESCRIPTION =
  "Diseñamos y producimos camisetas, conjuntos y uniformes sublimados personalizados para clubes, colegios y equipos. Diseño incluido, producción propia en Formosa y seguimiento online de tu pedido.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Las páginas públicas ya incluyen "· AH Sports" en sus títulos; el
  // template "%s" evita duplicar la marca y deja el sufijo a cada página.
  title: {
    default: `${SITE_NAME} · ${SITE_TAGLINE}`,
    template: "%s",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "indumentaria deportiva personalizada",
    "camisetas sublimadas",
    "uniformes para clubes",
    "sublimación full print",
    "indumentaria deportiva Formosa",
  ],
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: "/",
    siteName: SITE_NAME,
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#081226",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${archivo.variable} min-w-0`}>
      <body className="min-w-0 overflow-x-hidden">{children}</body>
    </html>
  );
}
