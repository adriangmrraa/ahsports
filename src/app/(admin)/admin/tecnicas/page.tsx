import { db } from "@/db/client";
import { techniques } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/Card";
import { PageGuide } from "@/components/admin/PageGuide";
import { TecnicasManager } from "./TecnicasManager";

export default async function TecnicasPage() {
  const rows = await db.select().from(techniques).orderBy(asc(techniques.name)).limit(500);

  return (
    <>
      <PageHeader
        title="Técnicas de producción"
        subtitle={`${rows.length} técnicas · costos por unidad, por m² y setup`}
      />
      <PageGuide
        what="Una técnica es un método de aplicación: sublimación, DTF, bordado, vinilo."
        whatFor="Sus costos (por unidad, por m² y setup) alimentan la receta y el precio final. Desactivá una técnica para dejar de ofrecerla."
        nextStep={{ href: "/admin/productos", label: "Asignar a productos" }}
      />
      <TecnicasManager initial={rows} />
    </>
  );
}
