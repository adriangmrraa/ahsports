import type { GarmentRendererKey } from "./registry";

/**
 * Pure bundle layout math — no three.js, no React. Kept separate from
 * BundleGarment.tsx so node tests can verify spacing without a DOM/WebGL.
 *
 * Approximate half-widths (in normalized garment units) per renderer family.
 * Every component is normalized to ~1.7 units tall before layout; these
 * widths keep side-by-side garments from overlapping — measured against the
 * real silhouette envelopes, padded for sleeve spread.
 */
export const FAMILY_HALF_WIDTH: Record<GarmentRendererKey, number> = {
  "sports-jersey": 0.66,
  hoodie: 0.72,
  bottoms: 0.46,
  accessory: 0.44,
  bundle: 0.6,
  "generic-garment": 0.55,
};

/** Breathing room between neighbouring garments, in garment units. */
export const LAYOUT_GAP = 0.24;
/** Max outfit span the stage comfortably frames at scale ~1. */
export const STAGE_MAX_SPAN = 2.35;

export type BundleLayout = { offsets: number[]; scale: number; span: number };

/**
 * Garments sit side by side, centered on the origin, separated by
 * LAYOUT_GAP. When the row would exceed the stage span the whole group
 * shrinks uniformly — never overlaps, never clips.
 */
export function computeBundleLayout(keys: readonly GarmentRendererKey[]): BundleLayout {
  const halfWidths = keys.map((key) => FAMILY_HALF_WIDTH[key] ?? 0.5);
  const span =
    halfWidths.reduce((sum, w) => sum + w * 2, 0) + LAYOUT_GAP * (keys.length - 1);
  const offsets: number[] = [];
  let cursor = -span / 2;
  for (const half of halfWidths) {
    offsets.push(cursor + half);
    cursor += half * 2 + LAYOUT_GAP;
  }
  const scale = Math.min(0.9, STAGE_MAX_SPAN / Math.max(span, 0.01));
  return { offsets, scale, span };
}
