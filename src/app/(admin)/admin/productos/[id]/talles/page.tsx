import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { products, sizes } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { SizesManager } from "./SizesManager";

export default async function TallesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) notFound();
  const productSizes = await db.select().from(sizes).where(eq(sizes.productId, id)).orderBy(asc(sizes.order));

  return (
    <>
      <PageHeader title={`Talles · ${product.name}`} subtitle="Configurar molde, medidas y consumos por talle" />
      <Card>
        <SizesManager productId={id} initial={productSizes.map((s) => ({ id: s.id, label: s.label, order: s.order, measurements: s.measurements as Record<string, number> }))} />
      </Card>
    </>
  );
}