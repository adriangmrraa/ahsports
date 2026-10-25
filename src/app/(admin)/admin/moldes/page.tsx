import { db } from "@/db/client";
import { garmentMolds } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { PageGuide } from "@/components/admin/PageGuide";
import { MoldesManager } from "./MoldesManager";

export default async function MoldesPage() {
  const molds = await db.select().from(garmentMolds).where(eq(garmentMolds.active, true)).orderBy(asc(garmentMolds.name));
  return (
    <>
      <PageHeader title="Moldes base" subtitle="Tablas de medidas reutilizables por familia de prenda" />
      <PageGuide
        what="Un molde base es la tabla de medidas (ancho, largo, etc.) que comparten varias prendas de la misma familia."
        whatFor="Asigná el molde a cada producto para no repetir medidas. Las recetas y talles siguen siendo de cada producto."
      />
      <Card>
        <MoldesManager initial={molds} />
      </Card>
    </>
  );
}
