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
    assert.equal(mapProductZoneLabel("Pierna izquierda"), "leg-left");
    assert.equal(mapProductZoneLabel("Pierna derecha"), "leg-right");
  });

  it("is case/space tolerant and returns null for unknown labels", () => {
    assert.equal(mapProductZoneLabel("  PECHO IZQUIERDO "), "chest-left");
    assert.equal(mapProductZoneLabel("Cintura"), null);
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
    assert.deepEqual(caps.sleeveVariants, ["sleeveless", "short", "long"]);
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
    assert.equal(caps.rendererKey, "hoodie");
    // Dedicated renderer → real placement surfaces on torso and sleeves.
    assert.equal(caps.supportsPlacements, true);
  });

  it("gives bottoms no collar/sleeve controls and real leg placement zones", () => {
    const caps = productCapabilities({ garmentType: "pantalon", garmentFamily: "pantalon" }, ["Pierna derecha", "Pierna izquierda"]);
    assert.equal(caps.rendererKey, "bottoms");
    assert.equal(caps.collarVariants.length, 0);
    assert.equal(caps.sleeveVariants.length, 0);
    assert.deepEqual(caps.colorRoles, ["primary", "accent"]);
    assert.equal(caps.supportsPlacements, true);
    assert.deepEqual(caps.zones, ["leg-right", "leg-left"]);
    assert.deepEqual(caps.unmappedZoneLabels, []);
  });

  it("bottoms default to leg zones when the catalog row has none", () => {
    const caps = productCapabilities({ garmentType: "bermuda" }, null);
    assert.deepEqual(caps.zones, ["leg-left", "leg-right"]);
  });

  it("a conjunto merges the capabilities of its real components", () => {
    const caps = productCapabilities(
      {
        garmentType: "conjunto",
        productKind: "bundle",
        components: [{ garmentType: "camiseta" }, { garmentType: "short" }],
      },
      null,
    );
    assert.equal(caps.rendererKey, "bundle");
    assert.equal(caps.supportsPlacements, true);
    // Upper zones come from the jersey, leg zones from the short.
    assert.ok(caps.zones.includes("chest-left"));
    assert.ok(caps.zones.includes("leg-left"));
    // Jersey component unlocks collar/sleeve controls for the whole set.
    assert.deepEqual(caps.collarVariants, ["crew", "v-neck", "polo"]);
    assert.deepEqual(caps.sleeveVariants, ["sleeveless", "short", "long"]);
  });

  it("a hoodie+pantalón conjunto exposes leg zones but no collar", () => {
    const caps = productCapabilities(
      {
        productKind: "bundle",
        components: [{ garmentType: "campera" }, { garmentType: "pantalon" }],
      },
      null,
    );
    assert.equal(caps.supportsPlacements, true);
    assert.ok(caps.zones.includes("leg-right"));
    assert.deepEqual(caps.collarVariants, []);
    assert.deepEqual(caps.sleeveVariants, ["long"]);
  });

  it("conjuntos without components stay honest — nothing to host placements", () => {
    const caps = productCapabilities({ garmentType: "conjunto", productKind: "bundle" }, jerseyZones);
    assert.equal(caps.rendererKey, "bundle");
    assert.equal(caps.supportsPlacements, false);
    assert.equal(caps.collarVariants.length, 0);
  });

  it("treats accesorios as a dedicated color-only model", () => {
    const caps = productCapabilities({ garmentType: "accesorio", garmentFamily: "accesorio", productType: "mochila_infantil" });
    assert.equal(caps.rendererKey, "accessory");
    assert.equal(caps.supportsPlacements, false);
    // Fabric presets still drive the accessory material.
    assert.equal(caps.supportsFabrics, true);
    const productTypeOnly = productCapabilities({ productType: "mochila_infantil" });
    assert.equal(productTypeOnly.rendererKey, "accessory");
    assert.equal(productTypeOnly.collarVariants.length, 0);
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
