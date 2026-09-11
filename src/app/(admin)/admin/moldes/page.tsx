import { db } from "@/db/client";
import { garmentMolds } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { MoldesManager } from "./MoldesManager";

export default async function MoldesPage() {
  const molds = await db.select().from(garmentMolds).where(eq(garmentMolds.active, true)).orderBy(asc(garmentMolds.name));
  return (
    <>
      <PageHeader title="Moldes base" subtitle="Tablas de medidas reutilizables por familia de prenda" />
      <Card>
        <MoldesManager initial={molds} />
      </Card>
    </>
  );
}
