import type { LucideIcon } from "lucide-react";
import {
  Box,
  Factory,
  HardHat,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  Package,
  Receipt,
  Ruler,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  Wrench,
} from "lucide-react";

export type AdminNavIcon =
  | "dashboard"
  | "orders"
  | "production"
  | "blocked"
  | "products"
  | "molds"
  | "recipes"
  | "materials"
  | "suppliers"
  | "techniques"
  | "customers"
  | "art"
  | "cash"
  | "payments"
  | "settings";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: AdminNavIcon;
  exact?: boolean;
  badge?: number;
};

const navigation: Array<Omit<AdminNavItem, "badge">> = [
  { href: "/admin", label: "Dashboard", icon: "dashboard", exact: true },
  { href: "/admin/pedidos", label: "Pedidos", icon: "orders" },
  { href: "/admin/pedidos/kanban", label: "Producción", icon: "production" },
  { href: "/admin/pedidos/bloqueados", label: "Bloqueados", icon: "blocked" },
  { href: "/admin/productos", label: "Productos", icon: "products" },
  { href: "/admin/moldes", label: "Moldes base", icon: "molds" },
  { href: "/admin/recetas", label: "Recetas (BOM)", icon: "recipes" },
  { href: "/admin/insumos", label: "Insumos", icon: "materials" },
  { href: "/admin/proveedores", label: "Proveedores", icon: "suppliers" },
  { href: "/admin/tecnicas", label: "Técnicas", icon: "techniques" },
  { href: "/admin/organizaciones", label: "Clientes", icon: "customers" },
  { href: "/admin/arte", label: "Arte & adjuntos", icon: "art" },
  { href: "/admin/caja", label: "Caja & saldos", icon: "cash" },
  { href: "/admin/pagos", label: "Pagos", icon: "payments" },
  { href: "/admin/configuracion", label: "Configuración", icon: "settings" },
];

export const ADMIN_NAV_ICONS: Record<AdminNavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  orders: ShoppingCart,
  production: Factory,
  blocked: HardHat,
  products: Package,
  molds: Ruler,
  recipes: Layers,
  materials: Box,
  suppliers: Truck,
  techniques: Wrench,
  customers: Users,
  art: ImageIcon,
  cash: Warehouse,
  payments: Receipt,
  settings: Settings,
};

export function getAdminNavItems(badges: { activeOrders: number; blockedOrders: number }): AdminNavItem[] {
  return navigation.map((item) => {
    if (item.href === "/admin/pedidos") return { ...item, badge: badges.activeOrders };
    if (item.href === "/admin/pedidos/bloqueados") return { ...item, badge: badges.blockedOrders };
    return item;
  });
}
