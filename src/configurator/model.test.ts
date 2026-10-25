/**
 * Configurator domain model contracts:
 * - normalization always returns a complete valid GarmentConfig,
 * - unknown enum values and invalid colors fall back to defaults,
 * - malformed placements are dropped, valid ones are clamped to range.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_GARMENT_CONFIG,
  garmentAssetRefs,
  isGarmentZone,
  isHexColor,
  normalizeGarmentConfig,
} from "@/configurator/model";

describe("isHexColor", () => {
  it("accepts 3/6/8-digit hex with leading #", () => {
    assert.equal(isHexColor("#fff"), true);
    assert.equal(isHexColor("#152a4d"), true);
    assert.equal(isHexColor("#152a4dff"), true);
  });

  it("rejects missing #, wrong length, non-hex and non-strings", () => {
    assert.equal(isHexColor("152a4d"), false);
    assert.equal(isHexColor("#12"), false);
    assert.equal(isHexColor("#xyzxyz"), false);
    assert.equal(isHexColor(42), false);
    assert.equal(isHexColor(null), false);
  });
});

describe("isGarmentZone", () => {
  it("accepts the declared zones and rejects anything else", () => {
    assert.equal(isGarmentZone("chest-left"), true);
    assert.equal(isGarmentZone("sleeve-right"), true);
    assert.equal(isGarmentZone("pecho-izquierdo"), false);
    assert.equal(isGarmentZone(""), false);
    assert.equal(isGarmentZone(7), false);
  });
});

describe("normalizeGarmentConfig", () => {
  it("returns defaults for null/undefined input", () => {
    assert.deepEqual(normalizeGarmentConfig(null), DEFAULT_GARMENT_CONFIG);
    assert.deepEqual(normalizeGarmentConfig(undefined), DEFAULT_GARMENT_CONFIG);
    assert.deepEqual(normalizeGarmentConfig({}), DEFAULT_GARMENT_CONFIG);
  });

  it("does not share references with the defaults", () => {
    const config = normalizeGarmentConfig(null);
    assert.notEqual(config.colors, DEFAULT_GARMENT_CONFIG.colors);
    assert.notEqual(config.placements, DEFAULT_GARMENT_CONFIG.placements);
  });

  it("keeps valid picks verbatim", () => {
    const input = {
      colors: { primary: "#112233", secondary: "#445566", accent: "#f5a524" },
      fabric: "pique",
      collar: "v-neck",
      sleeves: "long",
      view: "back",
    };
    const config = normalizeGarmentConfig(input);
    assert.equal(config.colors.primary, "#112233");
    assert.equal(config.fabric, "pique");
    assert.equal(config.collar, "v-neck");
    assert.equal(config.sleeves, "long");
    assert.equal(config.view, "back");
  });

  it("falls back per-field on invalid values without nuking valid siblings", () => {
    const config = normalizeGarmentConfig({
      colors: { primary: "navy", secondary: "#0f1f3a" },
      fabric: "seda",
      collar: "v-neck",
    });
    assert.equal(config.colors.primary, DEFAULT_GARMENT_CONFIG.colors.primary);
    assert.equal(config.colors.secondary, "#0f1f3a");
    assert.equal(config.colors.accent, DEFAULT_GARMENT_CONFIG.colors.accent);
    assert.equal(config.fabric, "performance");
    assert.equal(config.collar, "v-neck");
  });

  it("drops malformed placements and clamps the valid ones", () => {
    const config = normalizeGarmentConfig({
      placements: [
        { id: "logo-1", zone: "chest-left", assetRef: null, anchor: { u: 1.4, v: -0.2 }, scale: 1.2, rotationDeg: 15 },
        { id: "", zone: "back-upper", assetRef: null, anchor: { u: 0.5, v: 0.5 }, scale: 1, rotationDeg: 0 },
        { id: "logo-2", zone: "no-such-zone", assetRef: null, anchor: { u: 0.5, v: 0.5 }, scale: 1, rotationDeg: 0 },
        "garbage",
      ],
    });
    assert.equal(config.placements.length, 1);
    const [placement] = config.placements;
    assert.equal(placement.id, "logo-1");
    assert.equal(placement.anchor.u, 1);
    assert.equal(placement.anchor.v, 0);
    assert.equal(placement.scale, 1.2);
  });

  it("non-array placements resolve to an empty list", () => {
    const config = normalizeGarmentConfig({ placements: "nope" });
    assert.deepEqual(config.placements, []);
  });

  it("keeps a valid sublimation pattern and clamps its repeat", () => {
    const config = normalizeGarmentConfig({ sublimation: { assetRef: "att-pattern", repeat: 99 } });
    assert.deepEqual(config.sublimation, { assetRef: "att-pattern", repeat: 12 });
    assert.equal(normalizeGarmentConfig({ sublimation: { assetRef: "", repeat: 2 } }).sublimation, null);
  });
});

describe("garmentAssetRefs", () => {
  it("collects the base pattern and decals without duplicates", () => {
    const config = normalizeGarmentConfig({
      sublimation: { assetRef: "att-pattern", repeat: 2 },
      placements: [
        { id: "logo-1", zone: "chest-left", assetRef: "att-logo", anchor: { u: 0.5, v: 0.5 }, scale: 1, rotationDeg: 0 },
        { id: "logo-2", zone: "back-upper", assetRef: "att-pattern", anchor: { u: 0.5, v: 0.5 }, scale: 1, rotationDeg: 0 },
      ],
    });
    assert.deepEqual(garmentAssetRefs(config), ["att-logo", "att-pattern"]);
  });
});
