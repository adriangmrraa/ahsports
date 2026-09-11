import { db } from "@/db/client";
import { suppliers } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { InsumoForm } from "./InsumoForm";

export default async function NuevoInsumoPage() {
  const sups = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.active, true))
    .orderBy(asc(suppliers.name))
    .limit(500);
  return (
    <>
      <PageHeader title="Nuevo material / insumo" subtitle="Telas, hilos, films, tintas, etc." />
      <Card>
        <InsumoForm suppliers={sups} />
      </Card>
    </>
  );
}
