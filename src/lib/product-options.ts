/**
 * Product options domain: fabrics (telas), decoration methods and volume
 * discount tiers. Pure functions only — no DB access — so the pricing engine,
 * the admin editors and the public estimate can share one source of truth.
 */

export type FabricLike = { sublimable: boolean };
export type TechniqueLike = { requiresSublimableFabric: boolean };
export type VolumeTierLike = { minQty: number; discountPercent: number };

/** Sublimation needs a sublimable (polyester) fabric; every other method works on anything. */
export function techniqueAllowedForFabric(fabric: FabricLike, technique: TechniqueLike): boolean {
  return fabric.sublimable || !technique.requiresSublimableFabric;
}

/** Methods a fabric accepts, preserving input order. */
export function filterTechniquesForFabric<T extends TechniqueLike>(techniques: T[], fabric: FabricLike): T[] {
  return techniques.filter((technique) => techniqueAllowedForFabric(fabric, technique));
}

/**
 * Picks the applicable tier for a quantity: the row with the highest minQty
 * that is still <= quantity. Returns null when quantity is below every tier
 * or the ladder is empty. Tolerates unsorted input.
 */
export function selectVolumeTier<T extends VolumeTierLike>(tiers: T[], quantity: number): T | null {
  let best: T | null = null;
  for (const tier of tiers) {
    if (tier.minQty <= quantity && (best === null || tier.minQty > best.minQty)) best = tier;
  }
  return best;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function roundToStep(value: number, step: number) {
  return !step || step <= 0 ? round2(value) : Math.round(value / step) * step;
}

export type OptionUnitPriceInput = {
  basePrice: number;
  fabricDelta: number;
  methodDelta: number;
  /** technique.costPerUnit — charged per garment on top of the sell deltas. */
  techniqueCostPerUnit?: number;
  /** Fixed costs spread over the line quantity (setup + m²), per garment. */
  sharedCostPerUnit?: number;
  discountPercent?: number;
  /** Order-level urgent surcharge percent, applied before the tier discount. */
  urgentSurchargePercent?: number;
  /** pricingRules.rounding step (e.g. 100 → round to the hundred). */
  rounding?: number;
};

export type OptionUnitPrice = {
  /** Unit price before the volume discount (deltas + shared, surcharge applied). */
  listUnitPrice: number;
  /** Final unit price after the volume tier discount, rounded to the rule step. */
  unitPrice: number;
  discountPercent: number;
};

/**
 * Options pricing formula:
 *   list   = basePrice + fabricDelta + methodDelta + techniqueCostPerUnit + shared/qty
 *   urgent = list * (1 + surcharge%)
 *   unit   = roundToStep(urgent * (1 - discount%), rounding)
 * A product with basePrice 0 still quotes at 0 + deltas — deltas are never
 * swallowed by a missing base price.
 */
export function computeOptionUnitPrice(input: OptionUnitPriceInput): OptionUnitPrice {
  const list =
    input.basePrice +
    input.fabricDelta +
    input.methodDelta +
    (input.techniqueCostPerUnit ?? 0) +
    (input.sharedCostPerUnit ?? 0);
  const surcharged = list * (1 + (input.urgentSurchargePercent ?? 0) / 100);
  const discountPercent = input.discountPercent ?? 0;
  const unitPrice = roundToStep(surcharged * (1 - discountPercent / 100), input.rounding ?? 0);
  return { listUnitPrice: round2(surcharged), unitPrice, discountPercent };
}
