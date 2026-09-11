import Link from "next/link";
import { Layers, LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { ADMIN_NAV_ICONS, getAdminNavItems } from "@/components/layout/adminNavigation";
import { AdminMobileNav } from "@/components/layout/AdminMobileNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const activeRows = await db
    .select({ id: orders.id, status: orders.status, totalQuoted: orders.totalQuoted })
    .from(orders)
    .where(inArray(orders.status, ["aprobado", "seniado", "en_produccion", "corte", "confeccion", "estampado", "control"] as const));

  const blockedRows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.status, "bloqueado_pago"));

  const navItems = getAdminNavItems({ activeOrders: activeRows.length, blockedOrders: blockedRows.length });

  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex sidebar-width h-screen sticky top-0 bg-surface-container border-r border-outline-variant flex-col py-6 z-40">
        <Link href="/admin" className="px-6 mb-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/20 flex items-center justify-center border border-primary/50">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-headline text-xl text-primary tracking-tight leading-none">AH Sports</h1>
            <p className="label-caps text-on-surface-variant mt-1">Admin Terminal</p>
          </div>
        </Link>

        <nav className="flex-1 flex flex-col gap-1 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            const Icon = ADMIN_NAV_ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-6 py-2.5 text-on-surface-variant hover:text-primary hover:bg-surface-bright/10 transition-colors group"
              >
                <Icon className="w-4 h-4" />
                <span className="label-caps">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 ? (
                  <span className="ml-auto px-1.5 py-0.5 rounded bg-primary/20 border border-primary/40 text-primary text-[10px] font-bold">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="px-6 mt-4 border-t border-outline-variant pt-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary-container/30 border border-primary/40 flex items-center justify-center text-primary label-caps">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-on-surface truncate">{user.name}</p>
              <p className="text-[10px] text-on-surface-variant label-caps">{user.role}</p>
            </div>
          </div>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="w-full py-2 px-3 bg-transparent border border-outline-variant rounded-md text-on-surface-variant hover:text-error hover:border-error/50 label-caps flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-3 h-3" />
              Salir
            </button>
          </form>
        </div>
      </aside>

      <main className="relative min-h-screen min-w-0 flex-1 p-4 md:p-6 lg:p-8">
        <AdminMobileNav items={navItems} user={{ name: user.name, role: user.role }} />
        {children}
      </main>
    </div>
  );
}
