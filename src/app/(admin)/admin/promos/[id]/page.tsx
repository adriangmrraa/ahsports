import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { products, promotions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PageHeader, Card } from "@/components/ui/Card";
import { PageGuide } from "@/components/admin/PageGuide";
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
      <PageGuide
        what="Una promo es un combo nombrado de productos con precio promocional opcional."
        whatFor="Si el precio queda vacío se cobra la suma real. Los cambios aplican a las ventas nuevas."
      />
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
