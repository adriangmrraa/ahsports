/**
 * Bundle outfit layout contracts:
 * - components never overlap: consecutive centre gaps ≥ adjacent half-widths,
 * - the row is centered on the origin,
 * - oversized outfits shrink uniformly to fit the stage span.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeBundleLayout, FAMILY_HALF_WIDTH, LAYOUT_GAP, STAGE_MAX_SPAN } from "@/configurator/bundle-layout";

function edges(offsets: number[], keys: readonly (keyof typeof FAMILY_HALF_WIDTH)[]) {
  return keys.map((key, i) => {
    const half = FAMILY_HALF_WIDTH[key];
    return { left: offsets[i] - half, right: offsets[i] + half };
  });
}

describe("computeBundleLayout", () => {
  it("separates a camiseta+short conjunto with a visible gap", () => {
    const { offsets } = computeBundleLayout(["sports-jersey", "bottoms"]);
    const [jersey, shorts] = edges(offsets, ["sports-jersey", "bottoms"]);
    assert.ok(
      shorts.left - jersey.right >= LAYOUT_GAP - 1e-9,
      `gap ${shorts.left - jersey.right} < ${LAYOUT_GAP}`,
    );
  });

  it("never overlaps for every family pair", () => {
    const keys = Object.keys(FAMILY_HALF_WIDTH) as (keyof typeof FAMILY_HALF_WIDTH)[];
    for (const a of keys) {
      for (const b of keys) {
        const { offsets } = computeBundleLayout([a, b]);
        const [ea, eb] = edges(offsets, [a, b]);
        assert.ok(
          eb.left - ea.right >= LAYOUT_GAP - 1e-9,
          `${a}+${b} overlapped: gap ${eb.left - ea.right}`,
        );
      }
    }
  });

  it("centres the row on the origin", () => {
    const { offsets } = computeBundleLayout(["hoodie", "bottoms"]);
    const [hoodie, pants] = edges(offsets, ["hoodie", "bottoms"]);
    assert.ok(Math.abs(hoodie.left + pants.right) < 1e-9, "row not centered");
  });

  it("shrinks oversized outfits so the span fits the stage", () => {
    const { offsets, scale } = computeBundleLayout(["hoodie", "sports-jersey", "bottoms"]);
    const all = edges(offsets, ["hoodie", "sports-jersey", "bottoms"]);
    const span = all[all.length - 1].right - all[0].left;
    assert.ok(scale <= 0.9);
    assert.ok(span * scale <= STAGE_MAX_SPAN + 1e-9, `scaled span ${span * scale} exceeds stage`);
    // Still no overlap after shrinking (offsets scale uniformly with the group).
    for (let i = 1; i < all.length; i++) {
      assert.ok(all[i].left - all[i - 1].right >= LAYOUT_GAP - 1e-9);
    }
  });

  it("keeps a single component at natural scale", () => {
    const { offsets, scale } = computeBundleLayout(["sports-jersey"]);
    assert.equal(offsets.length, 1);
    assert.ok(Math.abs(offsets[0]) < 1e-9);
    assert.ok(scale <= 0.9 && scale > 0);
  });
});
