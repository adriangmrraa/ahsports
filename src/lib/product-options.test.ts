/**
 * Product options pricing contracts:
 * - non-sublimable fabrics never offer sublimation methods,
 * - the volume tier picked is always the highest minQty <= quantity,
 * - the options unit is basePrice + deltas + technique cost − tier discount,
 *   deterministically rounded to the rule step,
 * - a zero base price still quotes at 0 + deltas (deltas are never swallowed).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeOptionUnitPrice,
  filterTechniquesForFabric,
  normalizeTechniqueIds,
  selectVolumeTier,
  techniqueAllowedForFabric,
} from "@/lib/product-options";

const SUBLIMADO = { id: "t-sub", name: "Sublimado", requiresSublimableFabric: true };
const DTF = { id: "t-dtf", name: "DTF", requiresSublimableFabric: false };
const BORDADO = { id: "t-bor", name: "Bordado", requiresSublimableFabric: false };
const ALL = [SUBLIMADO, DTF, BORDADO];

describe("techniqueAllowedForFabric / filterTechniquesForFabric", () => {
  it("sublimable fabric accepts every method", () => {
    const fabric = { sublimable: true };
    assert.equal(techniqueAllowedForFabric(fabric, SUBLIMADO), true);
    assert.equal(techniqueAllowedForFabric(fabric, DTF), true);
    assert.deepEqual(filterTechniquesForFabric(ALL, fabric), ALL);
  });

  it("non-sublimable fabric (piqué) excludes sublimation only", () => {
    const pique = { sublimable: false };
    assert.equal(techniqueAllowedForFabric(pique, SUBLIMADO), false);
    assert.equal(techniqueAllowedForFabric(pique, DTF), true);
    assert.equal(techniqueAllowedForFabric(pique, BORDADO), true);
    assert.deepEqual(filterTechniquesForFabric(ALL, pique), [DTF, BORDADO]);
  });

  it("preserves input order when filtering", () => {
    const reordered = [BORDADO, SUBLIMADO, DTF];
    assert.deepEqual(filterTechniquesForFabric(reordered, { sublimable: false }), [BORDADO, DTF]);
  });
});

describe("selectVolumeTier", () => {
  const tiers = [
    { minQty: 10, discountPercent: 5 },
    { minQty: 50, discountPercent: 10 },
    { minQty: 100, discountPercent: 15 },
  ];

  it("returns null below the first tier and on empty ladders", () => {
    assert.equal(selectVolumeTier(tiers, 9), null);
    assert.equal(selectVolumeTier(tiers, 1), null);
    assert.equal(selectVolumeTier([], 500), null);
  });

  it("picks the exact tier at each boundary", () => {
    assert.equal(selectVolumeTier(tiers, 10)?.discountPercent, 5);
    assert.equal(selectVolumeTier(tiers, 50)?.discountPercent, 10);
    assert.equal(selectVolumeTier(tiers, 100)?.discountPercent, 15);
  });

  it("keeps the highest reached tier between boundaries", () => {
    assert.equal(selectVolumeTier(tiers, 11)?.discountPercent, 5);
    assert.equal(selectVolumeTier(tiers, 49)?.discountPercent, 5);
    assert.equal(selectVolumeTier(tiers, 51)?.discountPercent, 10);
    assert.equal(selectVolumeTier(tiers, 99)?.discountPercent, 10);
    assert.equal(selectVolumeTier(tiers, 150)?.discountPercent, 15);
  });

  it("tolerates unsorted input", () => {
    const shuffled = [tiers[2], tiers[0], tiers[1]];
    assert.equal(selectVolumeTier(shuffled, 60)?.minQty, 50);
  });
});

describe("computeOptionUnitPrice", () => {
  it("unit = basePrice + fabricDelta + methodDeltas sum", () => {
    const price = computeOptionUnitPrice({ basePrice: 8500, fabricDelta: 500, methodDeltas: [200] });
    assert.equal(price.listUnitPrice, 9200);
    assert.equal(price.unitPrice, 9200);
    assert.equal(price.discountPercent, 0);
  });

  it("adds technique costPerUnit and shared per-unit costs", () => {
    const price = computeOptionUnitPrice({
      basePrice: 8500,
      fabricDelta: 0,
      methodDeltas: [0],
      techniqueCostPerUnit: 800,
      sharedCostPerUnit: 200,
    });
    assert.equal(price.unitPrice, 9500);
  });

  it("applies the tier discount to the unit price", () => {
    const price = computeOptionUnitPrice({ basePrice: 10000, fabricDelta: 0, methodDeltas: [0], discountPercent: 10 });
    assert.equal(price.listUnitPrice, 10000);
    assert.equal(price.unitPrice, 9000);
  });

  it("zero base price still quotes at 0 + deltas", () => {
    const price = computeOptionUnitPrice({ basePrice: 0, fabricDelta: 300, methodDeltas: [150] });
    assert.equal(price.unitPrice, 450);
  });

  it("zero base price with deltas and discount quotes deltas minus tier", () => {
    const price = computeOptionUnitPrice({ basePrice: 0, fabricDelta: 1000, methodDeltas: [0], discountPercent: 50 });
    assert.equal(price.unitPrice, 500);
  });

  it("rounds to the configured step after the discount", () => {
    const price = computeOptionUnitPrice({ basePrice: 8500, fabricDelta: 0, methodDeltas: [0], discountPercent: 10, rounding: 100 });
    // 8500 * 0.9 = 7650 → step 100 → 7700 (Math.round).
    assert.equal(price.unitPrice, 7700);
  });

  it("rounds plain prices without a discount too", () => {
    const price = computeOptionUnitPrice({ basePrice: 8440, fabricDelta: 0, methodDeltas: [0], rounding: 100 });
    assert.equal(price.unitPrice, 8400);
  });

  it("applies the urgent surcharge before the tier discount", () => {
    const price = computeOptionUnitPrice({
      basePrice: 10000,
      fabricDelta: 0,
      methodDeltas: [0],
      urgentSurchargePercent: 15,
      discountPercent: 10,
    });
    // 10000 * 1.15 = 11500 → * 0.9 = 10350.
    assert.equal(price.listUnitPrice, 11500);
    assert.equal(price.unitPrice, 10350);
  });

  it("handles negative fabric deltas (cheaper fabrics)", () => {
    const price = computeOptionUnitPrice({ basePrice: 8500, fabricDelta: -500, methodDeltas: [0] });
    assert.equal(price.unitPrice, 8000);
  });

  it("stacks every selected method delta (sublimado + DTF + bordado)", () => {
    const price = computeOptionUnitPrice({ basePrice: 8500, fabricDelta: 500, methodDeltas: [200, 300, 400] });
    // 8500 + 500 + (200 + 300 + 400) = 9900.
    assert.equal(price.listUnitPrice, 9900);
    assert.equal(price.unitPrice, 9900);
  });

  it("stacked deltas apply before the tier discount", () => {
    const price = computeOptionUnitPrice({ basePrice: 8500, fabricDelta: 0, methodDeltas: [1000, 500], discountPercent: 10 });
    // (8500 + 1500) * 0.9 = 9000.
    assert.equal(price.listUnitPrice, 10000);
    assert.equal(price.unitPrice, 9000);
  });

  it("an empty method list behaves like zero methods", () => {
    const price = computeOptionUnitPrice({ basePrice: 8500, fabricDelta: 500, methodDeltas: [] });
    assert.equal(price.unitPrice, 9000);
  });
});

describe("normalizeTechniqueIds", () => {
  it("dedupes preserving pick order", () => {
    assert.deepEqual(normalizeTechniqueIds(["a", "b", "a", "c", "b"]), ["a", "b", "c"]);
  });

  it("folds the legacy single techniqueId when the array is empty", () => {
    assert.deepEqual(normalizeTechniqueIds([], "legacy"), ["legacy"]);
    assert.deepEqual(normalizeTechniqueIds(null, "legacy"), ["legacy"]);
    assert.deepEqual(normalizeTechniqueIds(undefined, "legacy"), ["legacy"]);
  });

  it("the array wins over the legacy id", () => {
    assert.deepEqual(normalizeTechniqueIds(["a", "b"], "legacy"), ["a", "b"]);
  });

  it("drops empty values and returns [] with no selection", () => {
    assert.deepEqual(normalizeTechniqueIds(["", null, undefined]), []);
    assert.deepEqual(normalizeTechniqueIds(null, null), []);
  });
});
