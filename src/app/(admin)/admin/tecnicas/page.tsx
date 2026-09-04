import { db } from "@/db/client";
import { techniques } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/Card";
import { TecnicasManager } from "./TecnicasManager";

export default async function TecnicasPage() {
  const rows = await db.select().from(techniques).orderBy(asc(techniques.name)).limit(500);

  return (
    <>
      <PageHeader
        title="Técnicas de producción"
        subtitle={`${rows.length} técnicas · costos por unidad, por m² y setup`}
      />
      <TecnicasManager initial={rows} />
    </>
  );
}
