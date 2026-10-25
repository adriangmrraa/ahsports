import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { fabrics, productFabrics, productTechniques, productVolumeTiers, techniques } from "@/db/schema";
import { normalizeTechniqueIds, techniqueAllowedForFabric } from "@/lib/product-options";

export { normalizeTechniqueIds };

/**
 * Validates the option selection an order line wants to capture, mirroring
 * the rules quoteOrder() enforces so an invalid combo fails at write time
 * instead of at quote time.
 *
 * - fabricId set → the fabric must exist, be active and be one of the
 *   product's configured product_fabrics (strict membership).
 * - product has configured methods (product_techniques) → at least one
 *   techniqueId is required and EVERY selected method must be a member;
 *   without configured methods any techniqueId is rejected only in options
 *   mode — a legacy BOM line without fabricId keeps the old "technique
 *   exists and is active" check.
 * - Methods are STACKABLE: every selected method is checked against the
 *   fabric — a sublimation method on a non-sublimable fabric is rejected.
 */
export async function assertLineOptionsAllowed(input: {
  productId: string;
  productName?: string;
  fabricId?: string | null;
  techniqueIds?: string[];
}): Promise<string | null> {
  const { productId, fabricId } = input;
  const techniqueIds = normalizeTechniqueIds(input.techniqueIds);
  if (!fabricId && techniqueIds.length === 0) return null;
  const productLabel = input.productName ? `"${input.productName}"` : "este producto";

  let selectedTechniques: Array<typeof techniques.$inferSelect> = [];
  if (techniqueIds.length > 0) {
    selectedTechniques = await db.select().from(techniques).where(inArray(techniques.id, techniqueIds));
    if (selectedTechniques.length !== techniqueIds.length) return "Un método seleccionado no existe";
    const inactive = selectedTechniques.find((technique) => !technique.active);
    if (inactive) return `El método "${inactive.name}" está inactivo`;
  }

  if (!fabricId) return null;

  const [fabric] = await db.select().from(fabrics).where(eq(fabrics.id, fabricId)).limit(1);
  if (!fabric || !fabric.active) return "La tela seleccionada no existe o está inactiva";

  const fabricRows = await db
    .select({ fabricId: productFabrics.fabricId })
    .from(productFabrics)
    .where(eq(productFabrics.productId, productId));
  if (!fabricRows.some((row) => row.fabricId === fabric.id)) {
    return `La tela "${fabric.name}" no está habilitada para ${productLabel}`;
  }

  const techniqueRows = await db
    .select({ techniqueId: productTechniques.techniqueId })
    .from(productTechniques)
    .where(eq(productTechniques.productId, productId));
  if (techniqueRows.length > 0) {
    if (techniqueIds.length === 0) return `El producto ${productLabel} requiere elegir al menos un método de aplicación`;
    const allowed = new Set(techniqueRows.map((row) => row.techniqueId));
    const disallowed = selectedTechniques.find((technique) => !allowed.has(technique.id));
    if (disallowed) return `El método "${disallowed.name}" no está habilitado para este producto`;
  } else if (techniqueIds.length > 0) {
    return `El producto ${productLabel} no tiene métodos configurables`;
  }

  for (const technique of selectedTechniques) {
    if (!techniqueAllowedForFabric(fabric, technique)) {
      return `La tela "${fabric.name}" no admite "${technique.name}"`;
    }
  }
  return null;
}

/** Effective sell-price delta of a fabric for a product: catalog + per-product modifier. */
export async function getProductFabricDelta(productId: string, fabricId: string): Promise<number | null> {
  const [fabric] = await db.select().from(fabrics).where(eq(fabrics.id, fabricId)).limit(1);
  if (!fabric) return null;
  const [row] = await db
    .select({ priceModifier: productFabrics.priceModifier })
    .from(productFabrics)
    .where(and(eq(productFabrics.productId, productId), eq(productFabrics.fabricId, fabricId)))
    .limit(1);
  if (!row) return null;
  return Number(fabric.priceModifier) + Number(row.priceModifier);
}

/**
 * Per-product sell deltas for a set of methods, keyed by techniqueId.
 * Used to snapshot order_line_techniques.price_modifier at line creation —
 * a technique not configured for the product simply yields no entry (the
 * caller already validated membership when productTechniques exist).
 */
export async function getProductMethodDeltas(productId: string, techniqueIds: string[]) {
  const ids = normalizeTechniqueIds(techniqueIds);
  if (ids.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ techniqueId: productTechniques.techniqueId, priceModifier: productTechniques.priceModifier })
    .from(productTechniques)
    .where(and(eq(productTechniques.productId, productId), inArray(productTechniques.techniqueId, ids)));
  return new Map(rows.map((row) => [row.techniqueId, Number(row.priceModifier)]));
}

/** Public-safe option catalog for a product: allowed fabrics, methods and tiers. */
export async function listProductOptions(productId: string) {
  const [fabricRows, techniqueRows, tierRows, allFabrics, allTechniques] = await Promise.all([
    db.select().from(productFabrics).where(eq(productFabrics.productId, productId)),
    db.select().from(productTechniques).where(eq(productTechniques.productId, productId)),
    db.select().from(productVolumeTiers).where(eq(productVolumeTiers.productId, productId)).orderBy(asc(productVolumeTiers.minQty)),
    db.select().from(fabrics).where(eq(fabrics.active, true)).orderBy(asc(fabrics.sortOrder), asc(fabrics.name)),
    db.select().from(techniques).where(eq(techniques.active, true)).orderBy(asc(techniques.name)),
  ]);
  const fabricById = new Map(allFabrics.map((fabric) => [fabric.id, fabric]));
  const techniqueById = new Map(allTechniques.map((technique) => [technique.id, technique]));
  return {
    fabrics: fabricRows.flatMap((row) => {
      const fabric = fabricById.get(row.fabricId);
      return fabric
        ? [{ id: fabric.id, name: fabric.name, sublimable: fabric.sublimable, priceDelta: Number(fabric.priceModifier) + Number(row.priceModifier) }]
        : [];
    }),
    techniques: techniqueRows.flatMap((row) => {
      const technique = techniqueById.get(row.techniqueId);
      return technique
        ? [{ id: technique.id, name: technique.name, requiresSublimableFabric: technique.requiresSublimableFabric, priceDelta: Number(row.priceModifier), costPerUnit: Number(technique.costPerUnit) }]
        : [];
    }),
    volumeTiers: tierRows.map((row) => ({ minQty: row.minQty, discountPercent: Number(row.discountPercent) })),
  };
}
