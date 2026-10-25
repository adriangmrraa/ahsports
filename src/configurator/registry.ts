import type { ProductGarmentDescriptor } from "./model";

/**
 * Product → renderer resolution. Pure logic: rules match on the product's
 * structural classification (garmentFamily / garmentType / productType /
 * productKind), never on product names or SKUs. When nothing specific
 * matches, resolution falls back explicitly so callers can render a neutral
 * garment instead of guessing.
 */

export const GARMENT_RENDERER_KEYS = [
  "sports-jersey",
  "hoodie",
  "bottoms",
  "bundle",
  "generic-garment",
] as const;
export type GarmentRendererKey = (typeof GARMENT_RENDERER_KEYS)[number];

/** Explicit fallback renderer key for products without a dedicated model. */
export const FALLBACK_RENDERER_KEY: GarmentRendererKey = "generic-garment";

/**
 * Which body scope a renderer's surface belongs to. Placement zones are
 * scoped the same way ("upper" zones raycast only upper-body meshes, "lower"
 * zones only leg meshes) so decals land on the right component in bundles.
 */
export const RENDERER_SCOPE: Record<GarmentRendererKey, "upper" | "lower" | "none"> = {
  "sports-jersey": "upper",
  hoodie: "upper",
  bottoms: "lower",
  bundle: "none",
  "generic-garment": "none",
};

export type RendererResolution = {
  key: GarmentRendererKey;
  /** true when a classification rule matched; false means explicit fallback. */
  matched: boolean;
  /** Why this renderer was picked — useful for admin/debug surfaces. */
  reason: string;
};

/** `garment_type` values whose silhouette the sports-jersey baseline covers. */
const JERSEY_GARMENT_TYPES = new Set(["camiseta", "remera", "chomba", "musculosa"]);

/** `garment_type` values rendered by the hoodie/jacket family. */
const HOODIE_GARMENT_TYPES = new Set(["campera", "canguro", "buzo", "camperon"]);

/**
 * `garment_type` values rendered by the bottoms family (long/short/bermuda/
 * slim variants are picked inside the renderer from the same fields).
 */
const BOTTOMS_GARMENT_TYPES = new Set(["pantalon", "short", "bermuda", "calza", "legging"]);

/** `garment_type` values that stay on the honest fallback (non-garments). */
const FALLBACK_GARMENT_TYPES = new Set(["accesorio"]);

/** `garment_family` values that default to the upper-body jersey baseline. */
const JERSEY_GARMENT_FAMILIES = new Set(["parte_superior"]);
const HOODIE_GARMENT_FAMILIES = new Set(["campera"]);
const BOTTOMS_GARMENT_FAMILIES = new Set(["pantalon", "short_futbol", "bermuda", "calza"]);

/**
 * Specificity order: bundle composition > garmentType > productType
 * (free-text taxonomy) > garmentFamily > explicit fallback. The first
 * matching rule wins.
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
  const kind = descriptor.productKind?.trim().toLowerCase();

  if (kind === "bundle" || garmentType === "conjunto" || (descriptor.components?.length ?? 0) > 0) {
    return { key: "bundle", matched: true, reason: "producto compuesto (conjunto)" };
  }

  if (garmentType) {
    if (JERSEY_GARMENT_TYPES.has(garmentType)) {
      return { key: "sports-jersey", matched: true, reason: `garmentType "${garmentType}"` };
    }
    if (HOODIE_GARMENT_TYPES.has(garmentType)) {
      return { key: "hoodie", matched: true, reason: `garmentType "${garmentType}"` };
    }
    if (BOTTOMS_GARMENT_TYPES.has(garmentType)) {
      return { key: "bottoms", matched: true, reason: `garmentType "${garmentType}"` };
    }
    if (FALLBACK_GARMENT_TYPES.has(garmentType)) {
      return {
        key: FALLBACK_RENDERER_KEY,
        matched: false,
        reason: `garmentType "${garmentType}" no es una prenda configurable`,
      };
    }
  }
  if (productType) {
    if (JERSEY_GARMENT_TYPES.has(productType)) {
      return { key: "sports-jersey", matched: true, reason: `productType "${productType}"` };
    }
    if (HOODIE_GARMENT_TYPES.has(productType)) {
      return { key: "hoodie", matched: true, reason: `productType "${productType}"` };
    }
    if (BOTTOMS_GARMENT_TYPES.has(productType)) {
      return { key: "bottoms", matched: true, reason: `productType "${productType}"` };
    }
  }
  if (garmentFamily) {
    if (JERSEY_GARMENT_FAMILIES.has(garmentFamily)) {
      return { key: "sports-jersey", matched: true, reason: `garmentFamily "${garmentFamily}"` };
    }
    if (HOODIE_GARMENT_FAMILIES.has(garmentFamily)) {
      return { key: "hoodie", matched: true, reason: `garmentFamily "${garmentFamily}"` };
    }
    if (BOTTOMS_GARMENT_FAMILIES.has(garmentFamily)) {
      return { key: "bottoms", matched: true, reason: `garmentFamily "${garmentFamily}"` };
    }
    return {
      key: FALLBACK_RENDERER_KEY,
      matched: false,
      reason: `garmentFamily "${garmentFamily}" aún no tiene renderer dedicado`,
    };
  }
  return { key: FALLBACK_RENDERER_KEY, matched: false, reason: "producto sin clasificación de prenda" };
}
