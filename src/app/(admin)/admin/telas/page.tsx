import { db } from "@/db/client";
import { fabrics } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/Card";
import { PageGuide } from "@/components/admin/PageGuide";
import { TelasManager } from "./TelasManager";

export default async function TelasPage() {
  const rows = await db.select().from(fabrics).orderBy(asc(fabrics.sortOrder), asc(fabrics.name)).limit(500);

  return (
    <>
      <PageHeader
        title="Telas"
        subtitle={`${rows.length} telas · catálogo de opciones por producto`}
      />
      <PageGuide
        what="Las telas son lo que el cliente elige al pedir: polar, piqué, jersey, etc."
        whatFor="El modificador de precio suma o resta sobre el precio base. “Sublimable” define qué métodos se pueden ofrecer."
        nextStep={{ href: "/admin/productos", label: "Habilitar por producto" }}
      />
      <TelasManager initial={rows} />
    </>
  );
}
