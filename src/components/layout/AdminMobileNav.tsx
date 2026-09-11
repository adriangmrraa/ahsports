"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, LogOut, Menu, X } from "lucide-react";
import { ADMIN_NAV_ICONS, type AdminNavItem } from "./adminNavigation";

type AdminMobileNavProps = {
  items: AdminNavItem[];
  user: { name: string; role: string };
};

export function AdminMobileNav({ items, user }: AdminMobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const activeHref = useMemo(
    () =>
      items
        .filter((item) => {
          if (item.exact) return pathname === item.href;
          return pathname === item.href || pathname.startsWith(`${item.href}/`);
        })
        .sort((a, b) => b.href.length - a.href.length)[0]?.href,
    [items, pathname],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      closeButtonRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (open || !openerRef.current) return;
    const opener = openerRef.current;
    requestAnimationFrame(() => opener.focus());
  }, [open]);

  function closeDrawer() {
    setOpen(false);
  }

  return (
    <>
      <header className="sticky top-0 z-30 -mx-4 -mt-4 mb-6 flex min-h-16 items-center justify-between border-b border-outline-variant bg-surface-container px-4 py-3 md:hidden">
        <Link href="/admin" className="flex items-center gap-2 focus-ring" aria-label="AH Sports, dashboard">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/50 bg-primary/20 text-primary">
            <Layers className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-headline text-base text-primary">AH Sports</span>
            <span className="label-caps block text-on-surface-variant">Admin</span>
          </span>
        </Link>
        <button
          ref={menuButtonRef}
          type="button"
          className="focus-ring flex min-h-11 min-w-11 items-center justify-center rounded-md border border-outline-variant text-on-surface hover:border-primary hover:text-primary"
          aria-label="Abrir navegación de administración"
          aria-expanded={open}
          aria-controls="admin-mobile-drawer"
          onClick={() => {
            openerRef.current = menuButtonRef.current;
            setOpen(true);
          }}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <dialog
        ref={dialogRef}
        id="admin-mobile-drawer"
        className="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-surface-dim/70"
        aria-labelledby="admin-mobile-drawer-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDrawer();
        }}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDrawer();
        }}
      >
        <div className="flex h-full w-[min(22rem,calc(100vw-3rem))] flex-col border-r border-outline-variant bg-surface-container px-4 py-5 shadow-2xl">
          <div className="mb-5 flex items-center justify-between border-b border-outline-variant pb-4">
            <div>
              <h2 id="admin-mobile-drawer-title" className="font-headline text-lg text-primary">Navegación</h2>
              <p className="label-caps mt-1 text-on-surface-variant">Admin Terminal</p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              className="focus-ring flex min-h-11 min-w-11 items-center justify-center rounded-md border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
              aria-label="Cerrar navegación de administración"
              onClick={closeDrawer}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="Navegación de administración" className="min-h-0 flex-1 overflow-y-auto pr-1">
            <ul className="space-y-1">
              {items.map((item) => {
                const Icon = ADMIN_NAV_ICONS[item.icon];
                const active = item.href === activeHref;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`focus-ring flex min-h-11 items-center gap-3 rounded-md border-l-2 px-3 py-2.5 transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-transparent text-on-surface-variant hover:bg-surface-bright/10 hover:text-primary"
                      }`}
                      aria-current={active ? "page" : undefined}
                      aria-label={item.badge !== undefined ? `${item.label}, ${item.badge} pendientes` : item.label}
                      onClick={closeDrawer}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="label-caps">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 ? (
                        <span className="ml-auto rounded border border-primary/40 bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary" aria-hidden="true">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="mt-5 border-t border-outline-variant pt-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/40 bg-primary-container/30 text-primary label-caps" aria-hidden="true">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-on-surface">{user.name}</p>
                <p className="label-caps text-[10px] text-on-surface-variant">{user.role}</p>
              </div>
            </div>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="focus-ring flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-outline-variant px-3 py-2 text-on-surface-variant hover:border-error/50 hover:text-error">
                <LogOut className="h-3 w-3" aria-hidden="true" />
                <span className="label-caps">Salir</span>
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
