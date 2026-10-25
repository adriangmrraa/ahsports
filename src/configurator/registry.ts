import type { ProductGarmentDescriptor } from "./model";

/**
 * Product → renderer resolution. Pure logic: rules match on the product's
 * structural classification (garmentFamily / garmentType / productType),
 * never on product names or SKUs. When nothing specific matches, resolution
 * falls back explicitly so callers can render a neutral garment instead of
 * guessing.
 */

export const GARMENT_RENDERER_KEYS = ["sports-jersey", "generic-garment"] as const;
export type GarmentRendererKey = (typeof GARMENT_RENDERER_KEYS)[number];

/** Explicit fallback renderer key for products without a dedicated model. */
export const FALLBACK_RENDERER_KEY: GarmentRendererKey = "generic-garment";

export type RendererResolution = {
  key: GarmentRendererKey;
  /** true when a classification rule matched; false means explicit fallback. */
  matched: boolean;
  /** Why this renderer was picked — useful for admin/debug surfaces. */
  reason: string;
};

/** `garment_type` values whose silhouette the sports-jersey baseline covers. */
const JERSEY_GARMENT_TYPES = new Set(["camiseta", "remera", "chomba"]);

/**
 * `garment_type` values we deliberately do NOT render as a jersey, even if a
 * coarser field (family/taxonomy) would suggest it. They need their own
 * dedicated renderers in later work units.
 */
const NON_JERSEY_GARMENT_TYPES = new Set(["campera", "pantalon", "short", "bermuda", "conjunto", "accesorio"]);

/** `garment_family` values that default to the upper-body jersey baseline. */
const JERSEY_GARMENT_FAMILIES = new Set(["parte_superior"]);

/**
 * Specificity order: garmentType > productType (free-text taxonomy) >
 * garmentFamily > explicit fallback. The first matching rule wins.
 */
export function resolveGarmentRenderer(
  descriptor: ProductGarmentDescriptor | null | undefined,
): RendererResolution {
  if (!descriptor) {
    return { key: FALLBACK_RENDERER_KEY, matched: false, reason: "sin descriptor de producto" };
  }
  const garmentType = descriptor.garmentType?.trim().toLowerCase();
  const productType = descriptor.productType?.trim().toLowerCase();
  const garmentFamily = descriptor.garmentFamily?.trim().toLowerCase();

  if (garmentType) {
    if (JERSEY_GARMENT_TYPES.has(garmentType)) {
      return { key: "sports-jersey", matched: true, reason: `garmentType "${garmentType}"` };
    }
    if (NON_JERSEY_GARMENT_TYPES.has(garmentType)) {
      return {
        key: FALLBACK_RENDERER_KEY,
        matched: false,
        reason: `garmentType "${garmentType}" aún no tiene renderer dedicado`,
      };
    }
  }
  if (productType && JERSEY_GARMENT_TYPES.has(productType)) {
    return { key: "sports-jersey", matched: true, reason: `productType "${productType}"` };
  }
  if (garmentFamily) {
    if (JERSEY_GARMENT_FAMILIES.has(garmentFamily)) {
      return { key: "sports-jersey", matched: true, reason: `garmentFamily "${garmentFamily}"` };
    }
    return {
      key: FALLBACK_RENDERER_KEY,
      matched: false,
      reason: `garmentFamily "${garmentFamily}" aún no tiene renderer dedicado`,
    };
  }
  return { key: FALLBACK_RENDERER_KEY, matched: false, reason: "producto sin clasificación de prenda" };
}
