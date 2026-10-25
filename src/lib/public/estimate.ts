import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { products, sizes } from "@/db/schema";
import { quoteOrder, type SizeQuantity } from "@/lib/pricing";

export type PublicEstimateSize = {
  sizeId: string | null;
  sizeLabel: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

/**
 * Customer-facing estimate. Deliberately narrow: unit prices, subtotals and
 * the advance (seña) the active rule expects. NEVER carries unitCost, margin
 * or rule internals — those stay server-side.
 */
export type PublicEstimate = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sizes: PublicEstimateSize[];
  advancePercent: number | null;
  advanceAmount: number | null;
  /** Applied option breakdown — deltas and tier only, never costs. */
  options?: {
    fabricId: string;
    fabricName: string;
    fabricDelta: number;
    /** Stackable methods the customer picked, each with its sell delta. */
    methods: Array<{ techniqueId: string; techniqueName: string; delta: number }>;
    /** Sum of every method delta. */
    methodsDelta: number;
    listUnitPrice: number;
    volumeTier: { minQty: number; discountPercent: number } | null;
    discountPercent: number;
  };
};

/**
 * Live estimate on top of the real pricing engine (BOM recipes + active
 * pricing rule). Returns null whenever the engine cannot quote — missing
 * recipe, inactive product, bundle gaps — so callers fall back to the
 * published basePrice instead of showing a wrong number.
 */
export async function getPublicEstimate(input: {
  productId: string;
  sizeQuantities: SizeQuantity[];
  fabricId?: string | null;
  /** Stackable methods — every selected delta sums into the unit price. */
  techniqueIds?: string[] | null;
  /** Legacy single-method form; techniqueIds wins when both are sent. */
  techniqueId?: string | null;
}): Promise<PublicEstimate | null> {
  const sizeQuantities = input.sizeQuantities
    .map((s) => ({ sizeId: s.sizeId ?? null, quantity: Math.trunc(s.quantity) }))
    .filter((s) => s.quantity > 0);
  const quantity = sizeQuantities.reduce((total, s) => total + s.quantity, 0);
  if (quantity === 0) return null;

  const [product] = await db
    .select({ id: products.id, active: products.active })
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);
  if (!product?.active) return null;

  try {
    const quote = await quoteOrder({
      lines: [{
        productId: product.id,
        quantity,
        sizeQuantities,
        fabricId: input.fabricId ?? null,
        techniqueIds: input.techniqueIds ?? null,
        techniqueId: input.techniqueId ?? null,
      }],
    });
    const line = quote.lines[0];
    if (!line || line.quantity === 0 || line.subtotal <= 0) return null;
    const advancePercent = quote.rule.minAdvancePercent;
    return {
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      totalPrice: line.subtotal,
      sizes: line.sizeBreakdown.map((s) => ({
        sizeId: s.sizeId,
        sizeLabel: s.sizeLabel,
        quantity: s.quantity,
        unitPrice: s.unitPrice,
        subtotal: s.subtotal,
      })),
      advancePercent,
      advanceAmount: (line.subtotal * advancePercent) / 100,
      options: line.options
        ? {
            fabricId: line.options.fabricId,
            fabricName: line.options.fabricName,
            fabricDelta: line.options.fabricDelta,
            methods: line.options.methods,
            methodsDelta: line.options.methodsDelta,
            listUnitPrice: line.options.listUnitPrice,
            volumeTier: line.options.volumeTier,
            discountPercent: line.options.discountPercent,
          }
        : undefined,
    };
  } catch {
    return null;
  }
}

const SIZE_ID_RE = /^[0-9a-fA-F-]{36}$/;

/**
 * Rebuilds size quantities from the wizard URL state. `sq` (sizeId:qty pairs
 * emitted by step 2) is the trusted path; the legacy `sizeQuantities`
 * (label:qty) falls back to a label→id lookup — but only when EVERY label
 * resolves, because an unresolved label silently quoting the generic recipe
 * would be a wrong estimate, and no estimate is better than a wrong one.
 */
export async function resolveWizardSizeQuantities(input: {
  productId: string;
  sq?: string;
  sizeQuantities?: string;
  total?: number;
}): Promise<SizeQuantity[]> {
  // A malformed non-empty sizeId is a tampered param — refuse the estimate
  // rather than quoting the generic recipe for a product that has sizes.
  let invalid = false;
  const fromIds = (input.sq ?? "")
    .split(",")
    .map((part) => {
      const [id, q] = part.split(":");
      const sizeId = id && SIZE_ID_RE.test(id) ? id : null;
      if (id && !sizeId) invalid = true;
      return { sizeId, quantity: Number(q || 0) };
    })
    .filter((entry) => entry.quantity > 0);
  if (invalid) return [];
  if (fromIds.length > 0) return fromIds;

  const productSizes = await db
    .select({ id: sizes.id, label: sizes.label })
    .from(sizes)
    .where(eq(sizes.productId, input.productId));
  const byLabel = new Map(productSizes.map((s) => [s.label, s.id]));

  const fromLabels = (input.sizeQuantities ?? "")
    .split(",")
    .map((part) => {
      const [label, q] = part.split(":");
      return { label, sizeId: byLabel.get(label) ?? null, quantity: Number(q || 0) };
    })
    .filter((entry) => entry.label && entry.quantity > 0);
  if (fromLabels.length > 0) {
    if (productSizes.length > 0 && fromLabels.some((entry) => entry.sizeId === null)) return [];
    return fromLabels.map(({ sizeId, quantity }) => ({ sizeId, quantity }));
  }

  const total = Math.trunc(input.total ?? 0);
  if (productSizes.length === 0 && total > 0) return [{ sizeId: null, quantity: total }];
  return [];
}
