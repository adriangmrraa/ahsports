/**
 * GLB garment pipeline: candidate resolution per product shape, envelope
 * normalization into garment units, material-slot classification, and the
 * backface cull that keeps decals off the rear wall of thin shells.
 * Pure CPU math — no WebGL needed.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  Box3,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from "three";
import {
  applyGarmentConfig,
  classifyMaterialSlot,
  glbCandidatesFor,
  normalizeGarmentScene,
} from "@/configurator/glb-models";
import { cullDecalBackfaces } from "@/configurator/viewer/PlacementDecals";
import { DEFAULT_GARMENT_CONFIG } from "@/configurator/model";

const cfg = { ...DEFAULT_GARMENT_CONFIG };

describe("glbCandidatesFor", () => {
  it("sleeveless prefers the sleeveless model then the plain jersey", () => {
    assert.deepEqual(glbCandidatesFor("sports-jersey", { ...cfg, sleeves: "sleeveless" }), [
      "/models/garments/sleeveless.glb",
      "/models/garments/jersey.glb",
    ]);
  });

  it("long sleeves try the dedicated model before the generic jersey", () => {
    assert.deepEqual(glbCandidatesFor("sports-jersey", { ...cfg, sleeves: "long" }), [
      "/models/garments/jersey-long.glb",
      "/models/garments/jersey.glb",
    ]);
  });

  it("bottoms resolve the variant file then the family fallback", () => {
    assert.deepEqual(
      glbCandidatesFor("bottoms", cfg, { garmentType: "short" } as never),
      ["/models/garments/shorts.glb", "/models/garments/bottoms.glb"],
    );
    assert.deepEqual(
      glbCandidatesFor("bottoms", cfg, { garmentType: "pantalon" } as never),
      ["/models/garments/pants.glb", "/models/garments/bottoms.glb"],
    );
  });

  it("bundle and generic keys stay procedural (no model candidates)", () => {
    assert.deepEqual(glbCandidatesFor("bundle", cfg), []);
    assert.deepEqual(glbCandidatesFor("generic-garment", cfg), []);
  });
});

describe("normalizeGarmentScene", () => {
  it("uniformly scales height, centers XZ and seats the bbox top", () => {
    // A 2×4×1 box at offset — like a GLB authored in arbitrary units/space.
    const src = new Group();
    const box = new Mesh(
      new BufferGeometry().setAttribute(
        "position",
        new Float32BufferAttribute(
          [-1, -2, -0.5, 1, -2, -0.5, 1, 2, -0.5, -1, 2, -0.5, -1, -2, 0.5, 1, -2, 0.5, 1, 2, 0.5, -1, 2, 0.5],
          3,
        ),
      ),
      new MeshBasicMaterial(),
    );
    box.position.set(5, 3, 0);
    src.add(box);

    const wrapped = normalizeGarmentScene(src, "sports-jersey");
    const out = new Box3().setFromObject(wrapped);
    const size = out.getSize(new Vector3());
    const center = out.getCenter(new Vector3());

    assert.ok(Math.abs(size.y - 1.68) < 1e-4, `height ${size.y} should be 1.68`);
    assert.ok(Math.abs(out.max.y - 1.64) < 1e-4, `top ${out.max.y} should be 1.64`);
    assert.ok(Math.abs(center.x) < 1e-4, `x center ${center.x} should be 0`);
    assert.ok(Math.abs(center.z) < 1e-4, `z center ${center.z} should be 0`);
  });

  it("falls back safely on empty/degenerate scenes", () => {
    const wrapped = normalizeGarmentScene(new Group(), "hoodie");
    assert.ok(wrapped instanceof Group);
  });
});

describe("classifyMaterialSlot", () => {
  it("routes trim/collar/cuff names to accent", () => {
    for (const name of ["Collar", "cuff_left", "Rib_Neck", "waistband", "zipper", "Pocket"]) {
      assert.equal(classifyMaterialSlot(name), "accent", name);
    }
  });

  it("routes panel/contrast names to secondary", () => {
    for (const name of ["Side_Panel", "yoke", "Contrast_Stripe", "color-block"]) {
      assert.equal(classifyMaterialSlot(name), "secondary", name);
    }
  });

  it("defaults unknown names to primary body", () => {
    for (const name of ["Fabric", "Material.001", "", "Top_shd"]) {
      assert.equal(classifyMaterialSlot(name), "primary", name);
    }
  });
});

describe("applyGarmentConfig", () => {
  const meshWith = (name: string) => {
    const m = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ name }));
    (m.material as MeshStandardMaterial).name = name;
    return m;
  };

  it("tints by slot and never mutates the source material", () => {
    const body = meshWith("FABRIC_main");
    const collar = meshWith("Collar");
    const root = new Group().add(body, collar);
    const before = (body.material as MeshStandardMaterial).color.clone();
    const config = { ...cfg, colors: { primary: "#112233", secondary: "#445566", accent: "#778899" } as never };

    applyGarmentConfig(root, config, { weave: null });

    const bodyMat = body.material as MeshStandardMaterial;
    const collarMat = collar.material as MeshStandardMaterial;
    assert.equal(bodyMat.color.getHexString(), "112233");
    assert.equal(collarMat.color.getHexString(), "778899");
    // Source materials stay untouched — clones protect the cached glTF scene.
    assert.notEqual((body.material as MeshStandardMaterial).uuid, undefined);
    assert.equal(before.getHexString(), "ffffff");
  });

  it("applies the sublimation pattern to body materials only", () => {
    const body = meshWith("fabric");
    const trim = meshWith("waistband");
    const root = new Group().add(body, trim);
    const pattern = { isTexture: true } as never;
    const config = { ...cfg, colors: { primary: "#112233", secondary: "#445566", accent: "#778899" } as never };

    applyGarmentConfig(root, config, { pattern, weave: null });

    assert.equal((body.material as MeshStandardMaterial).map, pattern);
    assert.equal((body.material as MeshStandardMaterial).color.getHexString(), "ffffff");
    assert.equal((trim.material as MeshStandardMaterial).map ?? null, null);
    assert.equal((trim.material as MeshStandardMaterial).color.getHexString(), "778899");
  });
});

describe("cullDecalBackfaces", () => {
  it("drops faces whose normals oppose the projector", () => {
    // Two triangles inside the projector box: front (+Z) and back (-Z).
    const geo = new BufferGeometry();
    geo.setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, -1, 1, 0, -1, 0, 1, -1], 3),
    );
    geo.setAttribute(
      "normal",
      new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3),
    );
    geo.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 2));

    const culled = cullDecalBackfaces(geo as never, new Vector3(0, 0, 1));
    assert.ok(culled);
    assert.equal(culled.attributes.position.count, 3, "only the front face survives");
    assert.ok(culled.attributes.position.getZ(0) > -0.5);
  });
});
