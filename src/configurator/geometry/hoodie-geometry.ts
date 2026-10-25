import {
  BufferGeometry,
  CylinderGeometry,
  LatheGeometry,
  Matrix4,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from "three";
import { buildSleeveGeometry, JERSEY_DIMENSIONS, sleeveEndTransform } from "./jersey-geometry";

/**
 * Procedural hoodie/jacket (campera, canguro): roomier lathe torso, ribbed
 * hem + cuffs, a layered hood shell behind the neck, a kangaroo pocket and
 * drawstrings. Long sleeves reuse the jersey's sleeve builder so arm
 * proportions stay consistent across the catalog.
 */

export const HOODIE_DIMENSIONS = {
  /** Slightly fuller than the jersey torso — fleece has body. */
  torsoScale: 1.06,
  hemY: 0.0,
} as const;

export type HoodieGeometryBundle = {
  torso: BufferGeometry;
  hood: BufferGeometry;
  hoodInner: BufferGeometry;
  pocket: BufferGeometry;
  hem: BufferGeometry;
  sleeveLeft: BufferGeometry;
  sleeveRight: BufferGeometry;
  cuffLeft: BufferGeometry;
  cuffRight: BufferGeometry;
  drawstringLeft: BufferGeometry;
  drawstringRight: BufferGeometry;
};

/** Fuller torso outline — straighter side walls, blouson hem. */
const HOODIE_TORSO_PROFILE: readonly [number, number][] = [
  [0.6, 0.0],
  [0.615, 0.2],
  [0.61, 0.45],
  [0.63, 0.75],
  [0.68, 1.0],
  [0.7, 1.18],
  [0.68, 1.32],
  [0.62, 1.45],
  [0.5, 1.54],
  [0.34, 1.6],
];

function buildHoodieTorsoGeometry(): BufferGeometry {
  const points = HOODIE_TORSO_PROFILE.map(([r, y]) => new Vector2(r, y));
  const geo = new LatheGeometry(points, 48);
  geo.applyMatrix4(new Matrix4().makeScale(1, 1, JERSEY_DIMENSIONS.flattenZ * 1.05));
  return geo;
}

/**
 * Hood: a flattened half-dome behind the neck opening, open toward the face.
 * Built as a sphere shell clipped to the rear hemisphere.
 */
function buildHoodGeometry(): BufferGeometry {
  const geo = new SphereGeometry(0.34, 36, 24, Math.PI * 0.9, Math.PI * 1.2, 0.15, Math.PI * 0.62);
  geo.applyMatrix4(new Matrix4().makeScale(1.06, 0.92, 0.78));
  geo.applyMatrix4(new Matrix4().makeTranslation(0, 1.62, -0.16));
  return geo;
}

/** Inner shell slightly smaller and darker — reads as the hood opening. */
function buildHoodInnerGeometry(): BufferGeometry {
  const geo = new SphereGeometry(0.3, 32, 20, Math.PI * 0.95, Math.PI * 1.1, 0.2, Math.PI * 0.5);
  geo.applyMatrix4(new Matrix4().makeScale(1.04, 0.9, 0.74));
  geo.applyMatrix4(new Matrix4().makeTranslation(0, 1.58, -0.12));
  return geo;
}

/** Kangaroo pocket: a shallow curved pouch on the lower front. */
function buildPocketGeometry(): BufferGeometry {
  const geo = new CylinderGeometry(0.34, 0.3, 0.34, 28, 1, true, -Math.PI / 3.4, Math.PI / 1.7);
  geo.applyMatrix4(new Matrix4().makeScale(1.35, 1, 1));
  geo.applyMatrix4(new Matrix4().makeTranslation(0, 0.34, 0.28));
  return geo;
}

/** Ribbed hem band at the bottom edge. */
function buildHemGeometry(): BufferGeometry {
  const geo = new TorusGeometry(0.6, 0.05, 14, 48);
  geo.applyMatrix4(new Matrix4().makeRotationX(Math.PI / 2));
  geo.applyMatrix4(new Matrix4().makeScale(1, 1, JERSEY_DIMENSIONS.flattenZ * 1.05));
  geo.applyMatrix4(new Matrix4().makeTranslation(0, 0.04, 0));
  return geo;
}

/** Ribbed cuff — same band logic as the jersey, built off sleeveEndTransform. */
function buildCuffGeometry(side: "left" | "right"): BufferGeometry {
  const geo = new CylinderGeometry(0.14, 0.14, 0.09, 32, 1, true);
  const transform = sleeveEndTransform("long", side);
  if (transform) geo.applyMatrix4(transform);
  return geo;
}

/** Short drawstring tube hanging from the hood edge. */
function buildDrawstringGeometry(side: "left" | "right"): BufferGeometry {
  const geo = new CylinderGeometry(0.012, 0.012, 0.16, 10, 1, false);
  geo.applyMatrix4(new Matrix4().makeTranslation(side === "left" ? 0.09 : -0.09, 1.42, 0.32));
  return geo;
}

export function buildHoodieGeometries(): HoodieGeometryBundle {
  const sleeveL = buildSleeveGeometry("long", "left");
  const sleeveR = buildSleeveGeometry("long", "right");
  const cuffL = buildCuffGeometry("left");
  const cuffR = buildCuffGeometry("right");
  if (!sleeveL || !sleeveR) throw new Error("hoodie sleeves must build");
  // The hoodie torso is wider than the jersey's — push the sleeve socket and
  // its cuffs outward so arms leave the shoulder seam instead of clipping in.
  const out = 0.11;
  sleeveL.translate(out, -0.01, 0);
  sleeveR.translate(-out, -0.01, 0);
  cuffL.translate(out, -0.01, 0);
  cuffR.translate(-out, -0.01, 0);
  return {
    torso: buildHoodieTorsoGeometry(),
    hood: buildHoodGeometry(),
    hoodInner: buildHoodInnerGeometry(),
    pocket: buildPocketGeometry(),
    hem: buildHemGeometry(),
    sleeveLeft: sleeveL,
    sleeveRight: sleeveR,
    cuffLeft: cuffL,
    cuffRight: cuffR,
    drawstringLeft: buildDrawstringGeometry("left"),
    drawstringRight: buildDrawstringGeometry("right"),
  };
}

export function disposeHoodieGeometries(bundle: HoodieGeometryBundle): void {
  for (const key of Object.keys(bundle) as (keyof HoodieGeometryBundle)[]) {
    bundle[key]?.dispose();
  }
}
