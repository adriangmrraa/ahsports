import { db } from "@/db/client";
import { materials, suppliers } from "@/db/schema";
import { desc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { PageGuide } from "@/components/admin/PageGuide";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { Plus } from "lucide-react";
import { InsumosTable } from "./InsumosTable";

export default async function InsumosPage() {
  const rows = await db
    .select({ material: materials, supplierName: suppliers.name })
    .from(materials)
    .leftJoin(suppliers, eq(materials.supplierId, suppliers.id))
    .orderBy(desc(materials.createdAt))
    .limit(500);

  return (
    <>
      <PageHeader
        title="Materiales e insumos"
        subtitle={`${rows.length} materiales en el catálogo`}
        action={<LinkButton href="/admin/insumos/nuevo"><Plus className="w-4 h-4" /> Nuevo insumo</LinkButton>}
      />
      <PageGuide
        what="Los insumos son lo que la prenda consume en producción: telas, hilos, films, avíos y packaging."
        whatFor="Cada insumo tiene su precio y unidad de compra. Las recetas los usan para calcular el costo real."
        nextStep={{ href: "/admin/insumos/nuevo", label: "Nuevo insumo" }}
      />

      {rows.length === 0 ? (
        <AdminEmptyState
          title="Sin materiales"
          what="Sin insumos cargados no hay forma de saber cuánto cuesta producir una prenda."
          whatFor="Cargá primero las telas y los consumibles que más uses; después armá las recetas."
          action={<LinkButton href="/admin/insumos/nuevo">Cargar primer material</LinkButton>}
        />
      ) : (
        <InsumosTable rows={rows.map(({ material, supplierName }) => ({ ...material, supplierName }))} />
      )}
    </>
  );
}
