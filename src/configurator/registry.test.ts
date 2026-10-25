/**
 * Renderer registry contracts:
 * - classification fields resolve in specificity order
 *   (garmentType > productType > garmentFamily),
 * - shirt-like products map to the sports-jersey renderer,
 * - unknown/unclassified products get the explicit fallback renderer
 *   (never a crash, never a product-name string switch).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FALLBACK_RENDERER_KEY,
  GARMENT_RENDERER_KEYS,
  resolveGarmentRenderer,
} from "@/configurator/registry";

describe("resolveGarmentRenderer — sports-jersey matches", () => {
  it("maps every shirt-like garmentType to sports-jersey", () => {
    for (const garmentType of ["camiseta", "remera", "chomba", "musculosa"]) {
      const res = resolveGarmentRenderer({ garmentType });
      assert.equal(res.key, "sports-jersey", garmentType);
      assert.equal(res.matched, true, garmentType);
    }
  });

  it("matches productType (free-text taxonomy) when garmentType is absent", () => {
    const res = resolveGarmentRenderer({ productType: "camiseta" });
    assert.equal(res.key, "sports-jersey");
    assert.equal(res.matched, true);
    assert.ok(res.reason.includes("productType"));
  });

  it("matches garmentFamily parte_superior when no type info exists", () => {
    const res = resolveGarmentRenderer({ garmentFamily: "parte_superior" });
    assert.equal(res.key, "sports-jersey");
    assert.equal(res.matched, true);
  });

  it("garmentType beats a contradictory family (data inconsistency)", () => {
    const res = resolveGarmentRenderer({ garmentType: "camiseta", garmentFamily: "pantalon" });
    assert.equal(res.key, "sports-jersey");
    assert.equal(res.matched, true);
  });
});

describe("resolveGarmentRenderer — dedicated family renderers", () => {
  it("campera/canguro map to the hoodie renderer", () => {
    for (const garmentType of ["campera", "canguro"]) {
      const res = resolveGarmentRenderer({ garmentType });
      assert.equal(res.key, "hoodie", garmentType);
      assert.equal(res.matched, true, garmentType);
    }
  });

  it("pantalon/short/bermuda/calza map to the bottoms renderer", () => {
    for (const garmentType of ["pantalon", "short", "bermuda", "calza"]) {
      const res = resolveGarmentRenderer({ garmentType });
      assert.equal(res.key, "bottoms", garmentType);
      assert.equal(res.matched, true, garmentType);
    }
  });

  it("conjuntos and bundle kinds map to the bundle renderer", () => {
    for (const descriptor of [
      { garmentType: "conjunto" },
      { productKind: "bundle", garmentType: "camiseta" },
      { components: [{ garmentType: "camiseta" }] },
    ]) {
      const res = resolveGarmentRenderer(descriptor);
      assert.equal(res.key, "bundle", JSON.stringify(descriptor));
      assert.equal(res.matched, true);
    }
  });

  it("a dedicated family beats a contradictory jersey family", () => {
    // A "short" labelled parte_superior must NOT render as a jersey.
    const res = resolveGarmentRenderer({ garmentType: "short", garmentFamily: "parte_superior" });
    assert.equal(res.key, "bottoms");
    assert.equal(res.matched, true);
  });
});

describe("resolveGarmentRenderer — explicit fallback", () => {
  it("null/empty descriptors fall back without matching", () => {
    for (const descriptor of [null, undefined, {}]) {
      const res = resolveGarmentRenderer(descriptor);
      assert.equal(res.key, FALLBACK_RENDERER_KEY);
      assert.equal(res.matched, false);
      assert.ok(res.reason.length > 0);
    }
  });

  it("non-garment types (accesorios) fall back honestly", () => {
    const res = resolveGarmentRenderer({ garmentType: "accesorio", garmentFamily: "parte_superior" });
    assert.equal(res.key, FALLBACK_RENDERER_KEY);
    assert.equal(res.matched, false);
  });

  it("unknown families fall back with a reason", () => {
    const res = resolveGarmentRenderer({ garmentFamily: "calzado" });
    assert.equal(res.key, FALLBACK_RENDERER_KEY);
    assert.equal(res.matched, false);
    assert.ok(res.reason.includes("calzado"));
  });

  it("unknown garmentType falls through to family/fallback", () => {
    const res = resolveGarmentRenderer({ garmentType: "quincho", garmentFamily: "parte_superior" });
    assert.equal(res.key, "sports-jersey");
    const orphan = resolveGarmentRenderer({ garmentType: "quincho" });
    assert.equal(orphan.key, FALLBACK_RENDERER_KEY);
    assert.equal(orphan.matched, false);
  });
});

describe("registry keys", () => {
  it("every declared key is a valid resolution target", () => {
    assert.ok(GARMENT_RENDERER_KEYS.includes("sports-jersey"));
    assert.ok(GARMENT_RENDERER_KEYS.includes(FALLBACK_RENDERER_KEY));
  });
});
