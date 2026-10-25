import { ImageResponse } from "next/og";

import { SITE_NAME } from "@/lib/public/site";

export const alt = "AH Sports · Indumentaria deportiva personalizada";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * OG card del sitio público: navy de marca + acento ámbar, tipografía
 * display pesada. Colores literales porque es una imagen generada, no UI.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#081226",
          backgroundImage:
            "radial-gradient(ellipse 60% 55% at 12% -5%, rgba(36,71,125,0.7) 0%, rgba(36,71,125,0) 70%), radial-gradient(ellipse 45% 45% at 95% 110%, rgba(245,165,36,0.16) 0%, rgba(245,165,36,0) 70%)",
          color: "#e8eefb",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 14,
              background: "#f5a524",
              color: "#081226",
              fontSize: 30,
              fontWeight: 900,
            }}
          >
            AH
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              textTransform: "uppercase",
            }}
          >
            {SITE_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              fontSize: 60,
              fontWeight: 900,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              maxWidth: 920,
            }}
          >
            Tu equipo, con identidad propia.
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 500,
              color: "#9db0d2",
              maxWidth: 820,
            }}
          >
            Camisetas y uniformes sublimados personalizados. Diseño incluido,
            producción propia y seguimiento online.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 22,
            fontWeight: 700,
            color: "#f5a524",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: 9999, background: "#f5a524" }} />
          Sublimación full-print · Formosa, Argentina
        </div>
      </div>
    ),
    size,
  );
}
