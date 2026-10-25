/**
 * On-mesh placement projection: each garment zone's ray must actually hit the
 * real jersey geometry and the resulting decal vertices must sit on the side
 * the zone names (front +Z, garment-left +X, etc.). Pure CPU math — no WebGL.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { buildJerseyGeometries } from "@/configurator/geometry/jersey-geometry";
import { projectDecalGeometry } from "@/configurator/viewer/PlacementDecals";
import type { GarmentZone, VisualAssetPlacement } from "@/configurator/model";

function jerseyGroup(sleeves: "short" | "long" = "short") {
  const bundle = buildJerseyGeometries({ collar: "crew", sleeves });
  const group = new Group();
  for (const geo of Object.values(bundle)) {
    group.add(new Mesh(geo, new MeshBasicMaterial()));
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
function centroid(geometry: { attributes: { position: { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } } }) {
  const pos = geometry.attributes.position;
  const c = new Vector3();
  for (let i = 0; i < pos.count; i++) c.add(new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  return c.multiplyScalar(1 / pos.count);
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
