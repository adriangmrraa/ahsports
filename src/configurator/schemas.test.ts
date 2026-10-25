/**
 * Configurator boundary schemas (zod): the server edge REJECTS malformed
 * stored state — unlike normalizeGarmentConfig, which repairs for the
 * renderer. Contracts covered:
 * - strict garment config validation (colors, enums, placements bounds),
 * - draft payload passthrough for forward compatibility,
 * - public draft token format.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  draftItemInputSchema,
  draftPayloadSchema,
  garmentConfigSchema,
  hexColorSchema,
  isDraftToken,
  sublimationPatternSchema,
  visualAssetPlacementSchema,
} from "@/configurator/schemas";
import { DEFAULT_GARMENT_CONFIG } from "@/configurator/model";

describe("hexColorSchema", () => {
  it("accepts valid hex and rejects the rest", () => {
    assert.equal(hexColorSchema.safeParse("#152a4d").success, true);
    assert.equal(hexColorSchema.safeParse("navy").success, false);
    assert.equal(hexColorSchema.safeParse("#12").success, false);
  });
});

describe("garmentConfigSchema", () => {
  it("accepts the default config", () => {
    assert.equal(garmentConfigSchema.safeParse(DEFAULT_GARMENT_CONFIG).success, true);
  });

  it("rejects invalid enum members and malformed placements", () => {
    assert.equal(
      garmentConfigSchema.safeParse({ ...DEFAULT_GARMENT_CONFIG, collar: "mandarina" }).success,
      false,
    );
    assert.equal(
      garmentConfigSchema.safeParse({
        ...DEFAULT_GARMENT_CONFIG,
        placements: [{ id: "x", zone: "chest-left", assetRef: null, anchor: { u: 1.4, v: 0.5 }, scale: 1, rotationDeg: 0 }],
      }).success,
      false,
    );
  });
});

describe("visualAssetPlacementSchema", () => {
  it("accepts a well-formed placement", () => {
    const ok = visualAssetPlacementSchema.safeParse({
      id: "logo-1",
      zone: "chest-left",
      assetRef: "att-123",
      anchor: { u: 0.3, v: 0.4 },
      scale: 1.5,
      rotationDeg: -10,
    });
    assert.equal(ok.success, true);
  });
});

describe("sublimationPatternSchema", () => {
  it("accepts an attachment plus repeat and rejects out-of-range values", () => {
    assert.equal(sublimationPatternSchema.safeParse({ assetRef: "att-pattern", repeat: 2.5 }).success, true);
    assert.equal(sublimationPatternSchema.safeParse({ assetRef: "att-pattern", repeat: 0.5 }).success, false);
    assert.equal(sublimationPatternSchema.safeParse({ assetRef: "", repeat: 2 }).success, false);
  });
});

describe("draftPayloadSchema", () => {
  it("accepts wizard state and keeps unknown keys for forward compatibility", () => {
    const parsed = draftPayloadSchema.safeParse({
      customerType: "club",
      name: "Club Renacer",
      productId: "prod-1",
      sizeQuantities: [{ sizeId: "size-1", quantity: 2 }, { sizeId: "size-2", quantity: 3 }],
      step: 2,
      futureField: { anything: true },
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.customerType, "club");
      assert.equal((parsed.data as Record<string, unknown>).futureField !== undefined, true);
    }
  });

  it("rejects invalid nested shapes", () => {
    assert.equal(draftPayloadSchema.safeParse({ customerType: "vecino" }).success, false);
    assert.equal(draftPayloadSchema.safeParse({ step: 9 }).success, false);
  });
});

describe("draftItemInputSchema", () => {
  it("requires a productId and a strict config", () => {
    assert.equal(draftItemInputSchema.safeParse({ productId: "p1", config: DEFAULT_GARMENT_CONFIG }).success, true);
    assert.equal(draftItemInputSchema.safeParse({ productId: "", config: DEFAULT_GARMENT_CONFIG }).success, false);
    assert.equal(draftItemInputSchema.safeParse({ config: DEFAULT_GARMENT_CONFIG }).success, false);
  });
});

describe("isDraftToken", () => {
  it("accepts cfg_-prefixed base64url tokens only", () => {
    assert.equal(isDraftToken(`cfg_${"a".repeat(43)}`), true);
    assert.equal(isDraftToken("cfg_short"), false);
    assert.equal(isDraftToken("nottoken_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), false);
    assert.equal(isDraftToken(null), false);
  });
});
