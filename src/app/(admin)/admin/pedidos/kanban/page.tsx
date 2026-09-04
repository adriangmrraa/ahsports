import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { PageHeader } from "@/components/ui/Card";
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