import { db } from "@/db/client";
import { products, sizes } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { Step2Form } from "./Step2Form";
import { StepIndicator } from "../_components/StepIndicator";
import { PageHero } from "@/components/public/PageHero";
import {
  WizardRateLimitNotice,
  wizardRateLimitReached,
} from "../_components/rate-limit";

export const metadata = { title: "Presupuesto · Paso 2 · AH Sports" };

/**
 * F4-09 — Paso 2: seleccionar producto + talles + cantidades.
 * Server component carga productos activos y sus talles reales (no inventa).
 */
export default async function PresupuestoStep2({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>;
}) {
  if (await wizardRateLimitReached()) return <WizardRateLimitNotice />;

  const sp = await searchParams;
  const [productRows, sizeRows] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        imageUrl: products.imageUrl,
        basePrice: products.basePrice,
        minOrder: products.minOrder,
        productKind: products.productKind,
        productSubcategory: products.productSubcategory,
      })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(products.name),
    db
      .select({ id: sizes.id, productId: sizes.productId, label: sizes.label, order: sizes.order })
      .from(sizes)
      .orderBy(asc(sizes.order)),
  ]);

  const sizesByProduct = new Map<string, { id: string; label: string }[]>();
  for (const s of sizeRows) {
    const list = sizesByProduct.get(s.productId) ?? [];
    list.push({ id: s.id, label: s.label });
    sizesByProduct.set(s.productId, list);
  }

  const catalog = productRows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    basePrice: p.basePrice,
    minOrder: p.minOrder,
    productKind: p.productKind,
    productSubcategory: p.productSubcategory || "otros",
    sizes: sizesByProduct.get(p.id) ?? [],
  }));
  const initialProductId = catalog.some((p) => p.id === sp.productId) ? sp.productId : undefined;

  return (
    <>
      <PageHero
        crumb="Presupuesto"
        eyebrow="Paso 2 de 5 · Producto"
        title={
          <>
            Elegí el producto <span className="text-accent">y los talles.</span>
          </>
        }
        lead="El catálogo completo con precios por unidad. Marcá cuántas prendas por talle y mirá el estimado en vivo."
      >
        <StepIndicator current={2} />
      </PageHero>
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <Step2Form catalog={catalog} initialProductId={initialProductId} />
      </div>
    </>
  );
}
