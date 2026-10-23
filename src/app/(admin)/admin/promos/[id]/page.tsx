import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { products, promotions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PageHeader, Card } from "@/components/ui/Card";
import { PromoForm } from "../PromoForm";

export const dynamic = "force-dynamic";

export default async function EditarPromoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [promo, productRows] = await Promise.all([
    db.select().from(promotions).where(eq(promotions.id, id)).limit(1).then((rows) => rows[0] ?? null),
    db.select({ id: products.id, name: products.name }).from(products).where(eq(products.active, true)).orderBy(asc(products.name)),
  ]);
  if (!promo) notFound();

  return (
    <>
      <PageHeader title={`Editar promo`} subtitle={promo.name} />
      <Card>
        <PromoForm
          products={productRows}
          initial={{
            id: promo.id,
            name: promo.name,
            description: promo.description,
            imageUrl: promo.imageUrl,
            customPrice: promo.customPrice,
            active: promo.active,
            items: promo.items ?? [],
          }}
        />
      </Card>
    </>
  );
}
