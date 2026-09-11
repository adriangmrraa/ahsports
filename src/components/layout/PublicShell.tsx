import Link from "next/link";

const navigation = [
  { href: "/", label: "Inicio" },
  { href: "/presupuesto", label: "Presupuesto" },
  { href: "/seguimiento", label: "Seguimiento" },
];

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-surface text-on-surface">
      <header className="border-b border-outline-variant bg-surface-container/90">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="shrink-0 text-lg font-semibold tracking-tight" aria-label="AH Sports, inicio">
            AH <span className="text-primary">Sports</span>
          </Link>
          <nav aria-label="Navegación pública" className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className="text-on-surface-variant transition hover:text-primary">
                {item.label}
              </Link>
            ))}
            <Link href="/login" className="label-caps rounded-md border border-outline-variant px-3 py-2 text-on-surface hover:border-primary hover:text-primary">
              Ingresar
            </Link>
          </nav>
        </div>
      </header>
      <main className="min-w-0 flex-1">{children}</main>
      <footer className="border-t border-outline-variant bg-surface-container-low">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-on-surface-variant sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>AH Sports · Indumentaria deportiva</span>
          <span>Formosa, Argentina</span>
        </div>
      </footer>
    </div>
  );
}
