import {
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Matrix4,
  Quaternion,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import type { CollarVariant, SleeveVariant } from "../model";

/**
 * Procedural sports-jersey geometry. Everything is built from real curved
 * volumes (lathes / cylinders / torus bands), baked with applyMatrix4 so
 * normals stay correct under non-uniform scaling. UVs come free from the
 * primitive generators, leaving the structure ready for textures/decals.
 * No Math.random anywhere — output is deterministic for a given variant set.
 */

/** Shared proportions so collar/sleeves stay registered with the torso. */
export const JERSEY_DIMENSIONS = {
  /** Neck opening radius and height — collar and sleeves anchor to these. */
  neckRadius: 0.3,
  neckY: 1.575,
  /** Front-to-back flattening applied to body + collar (torso is oval). */
  flattenZ: 0.62,
  /** Where sleeves leave the shoulder line. */
  sleeveAnchorX: 0.5,
  sleeveAnchorY: 1.44,
  /** Sleeve tilt: outward droop + slight forward swing, in radians. */
  sleeveTiltZ: 0.38,
  sleeveTiltX: 0.16,
} as const;

export type JerseyGeometryOptions = {
  collar: CollarVariant;
  sleeves: SleeveVariant;
};

export type JerseyGeometryBundle = {
  torso: BufferGeometry;
  /** Secondary-color shoulder panel, same lathe profile lifted outward. */
  yoke: BufferGeometry;
  collar: BufferGeometry;
  /** null on sleeveless — the armhole binding mesh covers the opening. */
  sleeveLeft: BufferGeometry | null;
  sleeveRight: BufferGeometry | null;
  cuffLeft: BufferGeometry | null;
  cuffRight: BufferGeometry | null;
  /** Armhole rib — present only on sleeveless (musculosa). */
  armholeLeft: BufferGeometry | null;
  armholeRight: BufferGeometry | null;
  /** Layered sublimation graphics on the front face. */
  graphicPanel: BufferGeometry;
  accentStripe: BufferGeometry;
};

function extrudeGarmentShape(shape: Shape, depth = 0.44, bevelSize = 0.035): BufferGeometry {
  const geo = new ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 28,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize,
    bevelThickness: 0.025,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Tailored front silhouette with a real concave neck opening. */
function torsoShape(scale = 1): Shape {
  const shape = new Shape();
  shape.moveTo(-0.57 * scale, 0);
  shape.quadraticCurveTo(-0.61 * scale, 0.35, -0.57 * scale, 0.62);
  shape.quadraticCurveTo(-0.55 * scale, 0.9, -0.66 * scale, 1.2);
  shape.quadraticCurveTo(-0.69 * scale, 1.35, -0.5 * scale, 1.49);
  shape.quadraticCurveTo(-0.4 * scale, 1.57, -0.3 * scale, 1.6);
  shape.quadraticCurveTo(0, 1.43, 0.3 * scale, 1.6);
  shape.quadraticCurveTo(0.4 * scale, 1.57, 0.5 * scale, 1.49);
  shape.quadraticCurveTo(0.69 * scale, 1.35, 0.66 * scale, 1.2);
  shape.quadraticCurveTo(0.55 * scale, 0.9, 0.57 * scale, 0.62);
  shape.quadraticCurveTo(0.61 * scale, 0.35, 0.57 * scale, 0);
  shape.closePath();
  return shape;
}

/** Bevelled apparel shell: readable jersey silhouette instead of a barrel. */
export function buildTorsoGeometry(): BufferGeometry {
  return extrudeGarmentShape(torsoShape());
}

/** Shoulder yoke follows the shoulder and neckline contours. */
function buildYokeGeometry(): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(-0.65, 1.2);
  shape.quadraticCurveTo(-0.68, 1.35, -0.49, 1.49);
  shape.quadraticCurveTo(-0.4, 1.57, -0.3, 1.6);
  shape.quadraticCurveTo(0, 1.43, 0.3, 1.6);
  shape.quadraticCurveTo(0.4, 1.57, 0.49, 1.49);
  shape.quadraticCurveTo(0.68, 1.35, 0.65, 1.2);
  shape.quadraticCurveTo(0.35, 1.12, 0, 1.2);
  shape.quadraticCurveTo(-0.35, 1.12, -0.65, 1.2);
  shape.closePath();
  return extrudeGarmentShape(shape, 0.455, 0.018);
}

function collarRing(tube: number, raise: number): TorusGeometry {
  const geo = new TorusGeometry(JERSEY_DIMENSIONS.neckRadius + 0.012, tube, 20, 48);
  // Torus is generated around Z; lay it flat on the shoulder line, then
  // flatten front-to-back to match the oval neck opening.
  geo.applyMatrix4(new Matrix4().makeRotationX(Math.PI / 2));
  geo.applyMatrix4(new Matrix4().makeScale(1, 1, JERSEY_DIMENSIONS.flattenZ));
  geo.applyMatrix4(new Matrix4().makeTranslation(0, JERSEY_DIMENSIONS.neckY + raise, 0));
  return geo;
}

/** Dip the front of a collar ring into a V — the classic football neckline. */
function dipCollarFront(geo: BufferGeometry, depth: number, width: number): void {
  const pos = geo.attributes.position;
  const flatten = JERSEY_DIMENSIONS.flattenZ;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (z <= 0) continue;
    // Angle around the ring: 0 at front centre (+Z), grows toward the sides.
    const angle = Math.abs(Math.atan2(x, z / flatten));
    const falloff = Math.max(0, Math.cos((angle / width) * (Math.PI / 2)));
    pos.setY(i, pos.getY(i) - depth * falloff * falloff);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

export function buildCollarGeometry(variant: CollarVariant): BufferGeometry {
  switch (variant) {
    case "v-neck": {
      const geo = collarRing(0.045, 0.012);
      dipCollarFront(geo, 0.17, 0.85);
      return geo;
    }
    case "polo": {
      // Stand collar: flared open band rising above the shoulder line.
      const geo = new CylinderGeometry(
        JERSEY_DIMENSIONS.neckRadius + 0.02,
        JERSEY_DIMENSIONS.neckRadius + 0.055,
        0.105,
        48,
        1,
        true,
      );
      geo.applyMatrix4(new Matrix4().makeScale(1, 1, JERSEY_DIMENSIONS.flattenZ));
      geo.applyMatrix4(new Matrix4().makeTranslation(0, JERSEY_DIMENSIONS.neckY + 0.045, 0));
      return geo;
    }
    case "crew":
    default:
      return collarRing(0.05, 0.008);
  }
}

const SLEEVE_LENGTHS: Record<SleeveVariant, number> = { sleeveless: 0, short: 0.44, long: 1.0 };
const SLEEVE_TOP_RADIUS = 0.185;
const SLEEVE_CUFF_RATIO: Record<SleeveVariant, number> = { sleeveless: 0, short: 0.8, long: 0.58 };

/**
 * Sleeve tube shaped per-variant: tapers toward the cuff, long sleeves pinch
 * slightly at the elbow and swing forward. Built along -Y from the origin,
 * then rotated/translated into the shoulder socket and baked.
 */
export function buildSleeveGeometry(variant: SleeveVariant, side: "left" | "right"): BufferGeometry | null {
  const length = SLEEVE_LENGTHS[variant];
  if (length === 0) return null;
  const mirror = side === "left" ? 1 : -1;
  const shoulderInner = 0.47;
  const shoulderOuter = 0.66;
  const outerEndX = variant === "long" ? 1.04 : 0.94;
  const outerEndY = variant === "long" ? 0.3 : 1.02;
  const innerEndX = variant === "long" ? 0.82 : 0.78;
  const innerEndY = variant === "long" ? 0.23 : 0.86;
  const shape = new Shape();
  shape.moveTo(mirror * shoulderInner, 1.48);
  shape.quadraticCurveTo(mirror * 0.59, 1.45, mirror * shoulderOuter, 1.34);
  shape.lineTo(mirror * outerEndX, outerEndY);
  shape.quadraticCurveTo(mirror * ((outerEndX + innerEndX) / 2), outerEndY - 0.04, mirror * innerEndX, innerEndY);
  shape.lineTo(mirror * 0.57, 1.13);
  shape.quadraticCurveTo(mirror * 0.5, 1.32, mirror * shoulderInner, 1.48);
  shape.closePath();
  return extrudeGarmentShape(shape, 0.36, 0.025);
}

function buildFrontGraphic(points: readonly [number, number][], z: number): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  const geo = new ShapeGeometry(shape, 16);
  geo.translate(0, 0, z);
  return geo;
}

/** World-space cuff centre — cuffs are thin bands hugging the sleeve end. */
export function sleeveEndTransform(variant: SleeveVariant, side: "left" | "right"): Matrix4 | null {
  const length = SLEEVE_LENGTHS[variant];
  if (length === 0) return null;
  const mirror = side === "left" ? 1 : -1;
  const direction = new Vector3(
    mirror * Math.sin(JERSEY_DIMENSIONS.sleeveTiltZ),
    -Math.cos(JERSEY_DIMENSIONS.sleeveTiltZ),
    Math.sin(JERSEY_DIMENSIONS.sleeveTiltX),
  ).normalize();
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), direction);
  const centre = new Vector3(
    mirror * JERSEY_DIMENSIONS.sleeveAnchorX,
    JERSEY_DIMENSIONS.sleeveAnchorY,
    0,
  ).addScaledVector(direction, length - 0.035);
  if (variant === "long") centre.z += 0.34;
  return new Matrix4().compose(centre, quaternion, new Vector3(1, 1, 1));
}

function buildCuffGeometry(variant: SleeveVariant, side: "left" | "right"): BufferGeometry | null {
  if (SLEEVE_LENGTHS[variant] === 0) return null;
  const cuffRadius = SLEEVE_TOP_RADIUS * SLEEVE_CUFF_RATIO[variant] * (variant === "short" ? 1.1 : 1) + 0.012;
  const geo = new CylinderGeometry(cuffRadius, cuffRadius, 0.07, 32, 1, true);
  const transform = sleeveEndTransform(variant, side);
  if (transform) geo.applyMatrix4(transform);
  return geo;
}

/** Rib ring hugging the armhole opening on sleeveless garments (musculosas). */
function buildArmholeRibGeometry(side: "left" | "right"): BufferGeometry {
  const mirror = side === "left" ? 1 : -1;
  const geo = new TorusGeometry(SLEEVE_TOP_RADIUS * 0.98, 0.028, 14, 40);
  // Lie the ring along the sleeve direction so it rims the armhole seam.
  const direction = new Vector3(
    mirror * Math.sin(JERSEY_DIMENSIONS.sleeveTiltZ),
    -Math.cos(JERSEY_DIMENSIONS.sleeveTiltZ),
    Math.sin(JERSEY_DIMENSIONS.sleeveTiltX),
  ).normalize();
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), direction.clone().negate());
  geo.applyQuaternion(quaternion);
  geo.applyMatrix4(
    new Matrix4().makeTranslation(
      mirror * JERSEY_DIMENSIONS.sleeveAnchorX,
      JERSEY_DIMENSIONS.sleeveAnchorY - 0.02,
      0,
    ),
  );
  return geo;
}

export function buildJerseyGeometries(options: JerseyGeometryOptions): JerseyGeometryBundle {
  const sleeveless = options.sleeves === "sleeveless";
  return {
    torso: buildTorsoGeometry(),
    yoke: buildYokeGeometry(),
    collar: buildCollarGeometry(options.collar),
    sleeveLeft: buildSleeveGeometry(options.sleeves, "left"),
    sleeveRight: buildSleeveGeometry(options.sleeves, "right"),
    cuffLeft: buildCuffGeometry(options.sleeves, "left"),
    cuffRight: buildCuffGeometry(options.sleeves, "right"),
    armholeLeft: sleeveless ? buildArmholeRibGeometry("left") : null,
    armholeRight: sleeveless ? buildArmholeRibGeometry("right") : null,
    graphicPanel: buildFrontGraphic([
      [-0.56, 0.18],
      [-0.39, 0.16],
      [0.62, 1.15],
      [0.61, 1.34],
    ], 0.255),
    accentStripe: buildFrontGraphic([
      [-0.58, 0.37],
      [-0.56, 0.29],
      [0.61, 1.2],
      [0.62, 1.29],
    ], 0.262),
  };
}

export function disposeJerseyGeometries(bundle: JerseyGeometryBundle): void {
  for (const key of Object.keys(bundle) as (keyof JerseyGeometryBundle)[]) {
    bundle[key]?.dispose();
  }
}
