import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PageHeader, Card } from "@/components/ui/Card";
import { PromoForm } from "../PromoForm";

export const dynamic = "force-dynamic";

export default async function NuevaPromoPage() {
  await requireUser();
  const rows = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(asc(products.name));

  return (
    <>
      <PageHeader title="Nueva promo" subtitle="Combo nombrado de productos del catálogo con precio promocional opcional" />
      <Card>
        <PromoForm products={rows} />
      </Card>
    </>
  );
}
