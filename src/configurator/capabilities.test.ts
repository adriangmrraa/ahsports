import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapProductZoneLabel, productCapabilities } from "./capabilities";
import { FALLBACK_RENDERER_KEY } from "./registry";

describe("mapProductZoneLabel", () => {
  it("maps catalog Spanish labels to model zones", () => {
    assert.equal(mapProductZoneLabel("Pecho izquierdo"), "chest-left");
    assert.equal(mapProductZoneLabel("Pecho derecho"), "chest-right");
    assert.equal(mapProductZoneLabel("Pecho central"), "front-center");
    assert.equal(mapProductZoneLabel("Frente completo"), "front-center");
    assert.equal(mapProductZoneLabel("Espalda alta"), "back-upper");
    assert.equal(mapProductZoneLabel("Espalda baja"), "back-lower");
    assert.equal(mapProductZoneLabel("Manga izquierda"), "sleeve-left");
    assert.equal(mapProductZoneLabel("Manga derecha"), "sleeve-right");
  });

  it("is case/space tolerant and returns null for unknown labels", () => {
    assert.equal(mapProductZoneLabel("  PECHO IZQUIERDO "), "chest-left");
    assert.equal(mapProductZoneLabel("Pierna derecha"), null);
    assert.equal(mapProductZoneLabel(""), null);
  });
});

describe("productCapabilities", () => {
  const jerseyZones = [
    "Pecho izquierdo",
    "Pecho central",
    "Pecho derecho",
    "Manga izquierda",
    "Manga derecha",
    "Espalda alta",
    "Espalda baja",
    "Espalda central",
    "Frente completo",
  ];

  it("gives full controls to jersey-family products", () => {
    const caps = productCapabilities({ garmentType: "camiseta", garmentFamily: "parte_superior" }, jerseyZones);
    assert.equal(caps.rendererKey, "sports-jersey");
    assert.deepEqual(caps.collarVariants, ["crew", "v-neck", "polo"]);
    assert.deepEqual(caps.sleeveVariants, ["short", "long"]);
    assert.equal(caps.supportsPlacements, true);
    assert.equal(caps.supportsFabrics, true);
    assert.ok(caps.zones.includes("chest-left"));
    assert.ok(caps.zones.includes("sleeve-right"));
    assert.equal(caps.unmappedZoneLabels.length, 0);
  });

  it("collapses duplicate zone labels (Frente completo/Pecho central)", () => {
    const caps = productCapabilities({ garmentType: "camiseta" }, jerseyZones);
    const frontCount = caps.zones.filter((z) => z === "front-center").length;
    assert.equal(frontCount, 1);
  });

  it("hides collar control for campera family and fixes sleeves to long", () => {
    const caps = productCapabilities({ garmentType: "campera", garmentFamily: "campera" }, jerseyZones);
    assert.equal(caps.collarVariants.length, 0);
    assert.deepEqual(caps.sleeveVariants, ["long"]);
    assert.equal(caps.rendererKey, FALLBACK_RENDERER_KEY);
    // Fallback renderer → placements/fabric controls off until a real renderer lands.
    assert.equal(caps.supportsPlacements, false);
  });

  it("gives bottoms no collar/sleeve controls", () => {
    const caps = productCapabilities({ garmentType: "pantalon", garmentFamily: "pantalon" }, ["Pierna derecha", "Pierna izquierda"]);
    assert.equal(caps.collarVariants.length, 0);
    assert.equal(caps.sleeveVariants.length, 0);
    assert.deepEqual(caps.colorRoles, ["primary", "accent"]);
    assert.deepEqual(caps.unmappedZoneLabels, ["Pierna derecha", "Pierna izquierda"]);
  });

  it("keeps conjuntos on color-only profile", () => {
    const caps = productCapabilities({ garmentType: "conjunto", productKind: "bundle" }, jerseyZones);
    assert.equal(caps.collarVariants.length, 0);
    assert.equal(caps.sleeveVariants.length, 0);
    assert.equal(caps.supportsPlacements, false);
  });

  it("treats accesorios as color-only fallback", () => {
    const caps = productCapabilities({ garmentType: "accesorio", garmentFamily: "accesorio", productType: "mochila_infantil" });
    assert.equal(caps.rendererKey, FALLBACK_RENDERER_KEY);
    assert.equal(caps.supportsPlacements, false);
    // Fabric presets still drive the fallback material — honest visual change.
    assert.equal(caps.supportsFabrics, true);
  });

  it("falls back to all model zones when the product has no zone list", () => {
    const caps = productCapabilities({ garmentType: "camiseta" }, null);
    assert.equal(caps.zones.length, 7);
  });

  it("degrades unknown descriptors to the safe jersey set", () => {
    const caps = productCapabilities(null);
    assert.equal(caps.rendererKey, FALLBACK_RENDERER_KEY);
    // Fallback renderer on unknown products keeps placements off.
    assert.equal(caps.supportsPlacements, false);
  });
});
