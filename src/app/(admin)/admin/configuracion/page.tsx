import { db } from "@/db/client";
import { pricingRules } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/Card";
import { PricingRulesManager } from "./PricingRulesManager";

export default async function ConfiguracionPage() {
  const rows = await db.select().from(pricingRules).orderBy(asc(pricingRules.name)).limit(500);

  return (
    <>
      <PageHeader
        title="Configuración"
        subtitle={`${rows.length} reglas de precio · solo una puede estar activa`}
      />
      <PricingRulesManager initial={rows} />
    </>
  );
}
