/**
 * On-mesh placement projection: each garment zone's ray must actually hit the
 * real jersey geometry and the resulting decal vertices must sit on the side
 * the zone names (front +Z, garment-left +X, etc.). Pure CPU math — no WebGL.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Group, Mesh, MeshBasicMaterial, Vector3, type BufferAttribute, type BufferGeometry } from "three";
import type { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { buildJerseyGeometries } from "@/configurator/geometry/jersey-geometry";
import { buildBottomsGeometries } from "@/configurator/geometry/bottoms-geometry";
import { buildHoodieGeometries } from "@/configurator/geometry/hoodie-geometry";
import { projectDecalGeometry } from "@/configurator/viewer/PlacementDecals";
import type { GarmentZone, VisualAssetPlacement } from "@/configurator/model";

function jerseyGroup(sleeves: "short" | "long" | "sleeveless" = "short") {
  const bundle = buildJerseyGeometries({ collar: "crew", sleeves });
  const group = new Group();
  for (const geo of Object.values(bundle)) {
    if (geo) group.add(new Mesh(geo, new MeshBasicMaterial()));
  }
  return group;
}

function placement(zone: GarmentZone, over: Partial<VisualAssetPlacement> = {}): VisualAssetPlacement {
  return {
    id: `p_${zone}`,
    zone,
    assetRef: "att_1",
    anchor: { u: 0.5, v: 0.5 },
    scale: 1,
    rotationDeg: 0,
    ...over,
  };
}

/** Centroid of the decal's baked (world-space) vertices. */
function centroid(geometry: DecalGeometry) {
  const pos = geometry.attributes.position as BufferAttribute;
  const c = new Vector3();
  for (let i = 0; i < pos.count; i++) c.add(new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  return c.multiplyScalar(1 / pos.count);
}

/** Simple group builder for arbitrary geometry sets (bottoms, hoodie…). */
function meshGroup(geometries: readonly (BufferGeometry | null)[]): Group {
  const group = new Group();
  for (const geo of geometries) {
    if (geo) group.add(new Mesh(geo, new MeshBasicMaterial()));
  }
  return group;
}

describe("projectDecalGeometry on the real jersey mesh", () => {
  it("front zones land on the +Z chest, offset to the correct side", () => {
    const group = jerseyGroup();
    const centre = projectDecalGeometry(group, placement("front-center"), 1);
    const left = projectDecalGeometry(group, placement("chest-left"), 1);
    const right = projectDecalGeometry(group, placement("chest-right"), 1);
    assert.ok(centre && left && right, "front zones must hit the torso");

    const cC = centroid(centre);
    const cL = centroid(left);
    const cR = centroid(right);
    assert.ok(cC.z > 0.2, `front decal faces +Z, got z=${cC.z.toFixed(2)}`);
    assert.ok(cL.x > cC.x, `chest-left sits further +X than centre (${cL.x.toFixed(2)} vs ${cC.x.toFixed(2)})`);
    assert.ok(cR.x < cC.x, `chest-right sits further -X than centre (${cR.x.toFixed(2)} vs ${cC.x.toFixed(2)})`);
    assert.ok(cL.z > 0.1 && cR.z > 0.1, "chest decals still face forward");
  });

  it("back zones land on the -Z surface", () => {
    const group = jerseyGroup();
    const upper = projectDecalGeometry(group, placement("back-upper"), 1);
    const lower = projectDecalGeometry(group, placement("back-lower"), 1);
    assert.ok(upper && lower);
    assert.ok(centroid(upper).z < -0.2);
    assert.ok(centroid(lower).z < -0.2);
    assert.ok(centroid(upper).y > centroid(lower).y, "back-upper sits above back-lower");
  });

  it("sleeve zones land on their own arm (+X left, -X right)", () => {
    const group = jerseyGroup();
    const left = projectDecalGeometry(group, placement("sleeve-left"), 1);
    const right = projectDecalGeometry(group, placement("sleeve-right"), 1);
    assert.ok(left && right);
    assert.ok(centroid(left).x > 0.35);
    assert.ok(centroid(right).x < -0.35);
  });

  it("sleeve zones still project on long sleeves", () => {
    const group = jerseyGroup("long");
    assert.ok(projectDecalGeometry(group, placement("sleeve-left"), 1));
    assert.ok(projectDecalGeometry(group, placement("sleeve-right"), 1));
  });

  it("returns null when the ray cannot land — nothing fake is drawn", () => {
    const group = new Group(); // empty garment
    assert.equal(projectDecalGeometry(group, placement("front-center"), 1), null);
  });

  it("respects scale in the projected size", () => {
    const group = jerseyGroup();
    const small = projectDecalGeometry(group, placement("front-center", { scale: 0.5 }), 1);
    const large = projectDecalGeometry(group, placement("front-center", { scale: 2 }), 1);
    assert.ok(small && large);
    small.computeBoundingBox();
    large.computeBoundingBox();
    const smallSize = new Vector3();
    const largeSize = new Vector3();
    small.boundingBox!.getSize(smallSize);
    large.boundingBox!.getSize(largeSize);
    assert.ok(largeSize.x > smallSize.x * 1.5, `scale 2 should be ~4x wider than scale 0.5 (${largeSize.x.toFixed(2)} vs ${smallSize.x.toFixed(2)})`);
  });
});

describe("sleeveless garment (musculosa)", () => {
  it("drops sleeves and grows armhole bindings instead", () => {
    const bundle = buildJerseyGeometries({ collar: "crew", sleeves: "sleeveless" });
    assert.equal(bundle.sleeveLeft, null);
    assert.equal(bundle.sleeveRight, null);
    assert.equal(bundle.cuffLeft, null);
    assert.equal(bundle.cuffRight, null);
    assert.ok(bundle.armholeLeft, "sleeveless must rim the armhole with a rib");
    assert.ok(bundle.armholeRight);
  });

  it("torso zones still project on a sleeveless body", () => {
    const group = jerseyGroup("sleeveless");
    assert.ok(projectDecalGeometry(group, placement("front-center"), 1));
    assert.ok(projectDecalGeometry(group, placement("chest-left"), 1));
    assert.ok(projectDecalGeometry(group, placement("back-upper"), 1));
  });
});

describe("bottoms family (pantalón/short/bermuda/calza)", () => {
  for (const variant of ["long", "bermuda", "short", "slim"] as const) {
    it(`leg zones land on the correct leg tube — ${variant}`, () => {
      const group = meshGroup(Object.values(buildBottomsGeometries(variant)));
      const left = projectDecalGeometry(group, placement("leg-left"), 1);
      const right = projectDecalGeometry(group, placement("leg-right"), 1);
      assert.ok(left && right, `leg decals must hit the ${variant} legs`);
      assert.ok(centroid(left).x > 0.05, `leg-left sits +X, got ${centroid(left).x.toFixed(2)}`);
      assert.ok(centroid(right).x < -0.05, `leg-right sits -X, got ${centroid(right).x.toFixed(2)}`);
      assert.ok(centroid(left).z > 0, "leg decal faces forward");
    });
  }

  it("upper-body zones do not draw on bottoms — no fake decal", () => {
    const tagged = new Group();
    const lower = meshGroup(Object.values(buildBottomsGeometries("long")));
    lower.userData.scope = "lower";
    tagged.add(lower);
    // A chest ray on a bottoms-only garment has no hostable scope → skip.
    assert.equal(projectDecalGeometry(tagged, placement("chest-left"), 1), null);
  });
});

describe("hoodie family (campera/canguro)", () => {
  it("chest and back zones land on the hoodie torso", () => {
    const group = meshGroup(Object.values(buildHoodieGeometries()));
    const chest = projectDecalGeometry(group, placement("chest-left"), 1);
    const back = projectDecalGeometry(group, placement("back-upper"), 1);
    assert.ok(chest && back);
    assert.ok(centroid(chest).z > 0.1, "chest decal faces +Z");
    assert.ok(centroid(back).z < -0.1, "back decal faces -Z");
  });

  it("sleeve zones land on the fixed long sleeves", () => {
    const group = meshGroup(Object.values(buildHoodieGeometries()));
    assert.ok(centroid(projectDecalGeometry(group, placement("sleeve-left"), 1)!).x > 0.3);
    assert.ok(centroid(projectDecalGeometry(group, placement("sleeve-right"), 1)!).x < -0.3);
  });
});

describe("bundle scope routing (conjuntos)", () => {
  /**
   * Jersey at x=-0.62 tagged "upper", bottoms at x=+0.62 tagged "lower" —
   * the layout BundleGarment produces. Decals must hit the component that
   * actually owns the zone, not whichever mesh happens to be in front.
   */
  function bundleGroup() {
    const root = new Group();
    const upper = jerseyGroup();
    upper.userData.scope = "upper";
    upper.position.x = -0.62;
    upper.scale.setScalar(0.82);
    const lower = meshGroup(Object.values(buildBottomsGeometries("short")));
    lower.userData.scope = "lower";
    lower.position.x = 0.62;
    lower.scale.setScalar(0.82);
    root.add(upper, lower);
    return root;
  }

  it("a leg zone lands on the bottoms component, never on the jersey torso", () => {
    const decal = projectDecalGeometry(bundleGroup(), placement("leg-left"), 1);
    assert.ok(decal, "leg zone must hit the bottoms leg");
    // The bottoms component sits at x=+0.62 — its left leg lands near +0.8.
    assert.ok(centroid(decal).x > 0.55, `leg decal must be on the pants, got x=${centroid(decal).x.toFixed(2)}`);
  });

  it("a chest zone lands on the jersey component, never on the pants", () => {
    const decal = projectDecalGeometry(bundleGroup(), placement("chest-left"), 1);
    assert.ok(decal, "chest zone must hit the jersey");
    assert.ok(centroid(decal).x < 0, `chest decal must be on the jersey, got x=${centroid(decal).x.toFixed(2)}`);
    assert.ok(centroid(decal).z > 0.05);
  });
});
