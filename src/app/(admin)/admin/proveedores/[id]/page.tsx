import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { materials, suppliers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { ProveedorForm } from "../nuevo/ProveedorForm";
import { EstadoButton } from "./EstadoButton";

export default async function ProveedorDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [s] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  if (!s) notFound();
  const linked = await db.select({ id: materials.id }).from(materials).where(eq(materials.supplierId, id));
  return (
    <>
      <PageHeader
        title={s.name}
        subtitle={`${linked.length} ${linked.length === 1 ? "insumo vinculado" : "insumos vinculados"} · ${s.active ? "activo" : "inactivo"}`}
        action={<EstadoButton id={s.id} active={s.active} />}
      />
      <Card>
        <ProveedorForm initial={s} />
      </Card>
    </>
  );
}
