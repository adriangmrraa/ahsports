import { db } from "@/db/client";
import { products, sizes, fabrics, techniques, productFabrics, productTechniques, productVolumeTiers } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { Step2Form } from "./Step2Form";
import { StepIndicator } from "../_components/StepIndicator";
import { resolveWizardDraft } from "../_components/wizard-draft";
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
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (await wizardRateLimitReached()) return <WizardRateLimitNotice />;

  const sp = await searchParams;
  const { token, payload } = await resolveWizardDraft(2, sp);
  const [productRows, sizeRows, fabricRows, techniqueOptionRows, tierRows, allFabricRows] = await Promise.all([
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
    // Per-product selectable options: only fabrics/methods the product
    // configured in admin are offered — the engine re-validates anyway.
    // Fabric delta = catalog modifier + per-product modifier, same formula
    // as getProductFabricDelta / the pricing engine.
    db
      .select({
        productId: productFabrics.productId,
        id: fabrics.id,
        name: fabrics.name,
        sublimable: fabrics.sublimable,
        catalogDelta: fabrics.priceModifier,
        productDelta: productFabrics.priceModifier,
      })
      .from(productFabrics)
      .innerJoin(fabrics, eq(productFabrics.fabricId, fabrics.id))
      .where(eq(fabrics.active, true))
      .orderBy(asc(fabrics.sortOrder), asc(fabrics.name)),
    db
      .select({ productId: productTechniques.productId, id: techniques.id, name: techniques.name, requiresSublimableFabric: techniques.requiresSublimableFabric, priceDelta: productTechniques.priceModifier })
      .from(productTechniques)
      .innerJoin(techniques, eq(productTechniques.techniqueId, techniques.id))
      .where(eq(techniques.active, true))
      .orderBy(asc(techniques.name)),
    db
      .select({ productId: productVolumeTiers.productId, minQty: productVolumeTiers.minQty, discountPercent: productVolumeTiers.discountPercent })
      .from(productVolumeTiers)
      .orderBy(asc(productVolumeTiers.minQty)),
    // Fallback catalog: a product without configured fabrics offers every
    // active fabric (catalog delta only — there is no per-product override).
    db
      .select({ id: fabrics.id, name: fabrics.name, sublimable: fabrics.sublimable, priceDelta: fabrics.priceModifier })
      .from(fabrics)
      .where(eq(fabrics.active, true))
      .orderBy(asc(fabrics.sortOrder), asc(fabrics.name)),
  ]);

  const sizesByProduct = new Map<string, { id: string; label: string }[]>();
  for (const s of sizeRows) {
    const list = sizesByProduct.get(s.productId) ?? [];
    list.push({ id: s.id, label: s.label });
    sizesByProduct.set(s.productId, list);
  }

  const fabricsByProduct = new Map<string, { id: string; name: string; sublimable: boolean; priceDelta: number }[]>();
  for (const f of fabricRows) {
    const list = fabricsByProduct.get(f.productId) ?? [];
    list.push({ id: f.id, name: f.name, sublimable: f.sublimable, priceDelta: Number(f.catalogDelta) + Number(f.productDelta) });
    fabricsByProduct.set(f.productId, list);
  }
  const fallbackFabrics = allFabricRows.map((f) => ({ id: f.id, name: f.name, sublimable: f.sublimable, priceDelta: Number(f.priceDelta) }));
  const methodsByProduct = new Map<string, { id: string; name: string; requiresSublimableFabric: boolean; priceDelta: number }[]>();
  for (const t of techniqueOptionRows) {
    const list = methodsByProduct.get(t.productId) ?? [];
    list.push({ id: t.id, name: t.name, requiresSublimableFabric: t.requiresSublimableFabric, priceDelta: Number(t.priceDelta) });
    methodsByProduct.set(t.productId, list);
  }
  const tiersByProduct = new Map<string, { minQty: number; discountPercent: number }[]>();
  for (const t of tierRows) {
    const list = tiersByProduct.get(t.productId) ?? [];
    list.push({ minQty: t.minQty, discountPercent: Number(t.discountPercent) });
    tiersByProduct.set(t.productId, list);
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
    fabrics: fabricsByProduct.get(p.id) ?? fallbackFabrics,
    // Strict membership only exists once admin configured product_fabrics —
    // without rows the fallback catalog is offered as an optional pick.
    fabricConfigured: fabricsByProduct.has(p.id),
    methods: methodsByProduct.get(p.id) ?? [],
    volumeTiers: tiersByProduct.get(p.id) ?? [],
  }));
  const initialProductId = catalog.some((p) => p.id === payload.productId) ? payload.productId : undefined;
  // Draft-held picks restore the form when the user navigates back.
  const initialQuantities: Record<string, number> = {};
  for (const sq of payload.sizeQuantities ?? []) {
    if (sq.sizeId) initialQuantities[sq.sizeId] = sq.quantity;
  }
  const initialDirect = (payload.sizeQuantities ?? []).find((s) => s.sizeId === null)?.quantity ?? 0;

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
        <Step2Form
          catalog={catalog}
          draftToken={token}
          initialProductId={initialProductId}
          initialQuantities={initialQuantities}
          initialDirectQuantity={initialDirect}
          initialFabricId={payload.fabricId ?? ""}
          initialMethodIds={payload.techniqueIds ?? []}
        />
      </div>
    </>
  );
}
