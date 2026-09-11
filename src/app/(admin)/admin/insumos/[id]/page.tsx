import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { materials, suppliers } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { InsumoForm } from "../nuevo/InsumoForm";
import { DesactivarButton } from "./DesactivarButton";

export default async function InsumoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [m] = await db.select().from(materials).where(eq(materials.id, id)).limit(1);
  if (!m) notFound();
  const sups = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.active, true))
    .orderBy(asc(suppliers.name))
    .limit(500);
  return (
    <>
      <PageHeader
        title={m.name}
        subtitle={`${m.category} · ${m.unit} · ${m.active ? "activo" : "inactivo"}`}
        action={<DesactivarButton id={m.id} active={m.active} />}
      />
      <Card>
        <InsumoForm initial={m} suppliers={sups} />
      </Card>
    </>
  );
}
