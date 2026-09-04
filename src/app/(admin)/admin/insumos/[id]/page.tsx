import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { materials } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { InsumoForm } from "../nuevo/InsumoForm";
import { DesactivarButton } from "./DesactivarButton";

export default async function InsumoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [m] = await db.select().from(materials).where(eq(materials.id, id)).limit(1);
  if (!m) notFound();
  return (
    <>
      <PageHeader
        title={m.name}
        subtitle={`${m.category} · ${m.unit} · ${m.active ? "activo" : "inactivo"}`}
        action={<DesactivarButton id={m.id} active={m.active} />}
      />
      <Card>
        <InsumoForm initial={m} />
      </Card>
    </>
  );
}