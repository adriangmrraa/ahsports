import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AH Sports · OS",
  description: "Sistema operativo del taller AH Sports",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark min-w-0">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Space+Grotesk:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-w-0 overflow-x-hidden">{children}</body>
    </html>
  );
}
