import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { PageHeader } from "@/components/ui/Card";
import { PageGuide } from "@/components/admin/PageGuide";
import { KanbanBoard } from "./KanbanBoard";

export default async function KanbanPage() {
  const rows = await db
    .select()
    .from(orders)
    .where(inArray(orders.status, ["aprobado", "seniado", "en_produccion", "corte", "confeccion", "estampado", "control"] as const))
    .orderBy(orders.createdAt);

  return (
    <>
      <PageHeader title="Kanban de Producción" subtitle={`${rows.length} pedidos activos en taller`} />
      <PageGuide
        what="El tablero muestra los pedidos aprobados ordenados por etapa del taller."
        whatFor="Arrastrá un pedido a la siguiente columna cuando termines la etapa. Un pedido sin seña no puede avanzar."
        nextStep={{ href: "/admin/pedidos", label: "Ver pedidos" }}
      />
      <KanbanBoard initialOrders={rows.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        totalQuoted: o.totalQuoted,
        notes: o.notes,
        urgent: o.urgent,
      }))} />
    </>
  );
}