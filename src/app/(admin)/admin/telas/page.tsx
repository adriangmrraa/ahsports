import { db } from "@/db/client";
import { fabrics } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/Card";
import { TelasManager } from "./TelasManager";

export default async function TelasPage() {
  const rows = await db.select().from(fabrics).orderBy(asc(fabrics.sortOrder), asc(fabrics.name)).limit(500);

  return (
    <>
      <PageHeader
        title="Telas"
        subtitle={`${rows.length} telas · catálogo de opciones por producto`}
      />
      <TelasManager initial={rows} />
    </>
  );
}
