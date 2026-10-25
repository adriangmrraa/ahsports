import {
  BufferGeometry,
  CylinderGeometry,
  LatheGeometry,
  Matrix4,
  Quaternion,
  TorusGeometry,
  Vector2,
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
};

const LATHE_SEGMENTS = 48;

/** Torso outline from hem (y=0) to neck opening — radius vs height. */
const TORSO_PROFILE: readonly [number, number][] = [
  [0.585, 0.0],
  [0.578, 0.18],
  [0.56, 0.42],
  [0.575, 0.68],
  [0.63, 0.95],
  [0.66, 1.14],
  [0.655, 1.28],
  [0.6, 1.4],
  [0.5, 1.51],
  [0.37, 1.56],
  [JERSEY_DIMENSIONS.neckRadius, JERSEY_DIMENSIONS.neckY],
];

function latheFromProfile(profile: readonly [number, number][], scale: number, lift: number): LatheGeometry {
  const points = profile.map(([r, y]) => new Vector2(r * scale, y + lift));
  return new LatheGeometry(points, LATHE_SEGMENTS);
}

/** Curved oval torso: lathe flattened front-to-back into a body section. */
export function buildTorsoGeometry(): BufferGeometry {
  const geo = latheFromProfile(TORSO_PROFILE, 1, 0);
  geo.applyMatrix4(new Matrix4().makeScale(1, 1, JERSEY_DIMENSIONS.flattenZ));
  return geo;
}

/** Shoulder yoke: same profile inflated slightly, covering only the top band. */
function buildYokeGeometry(): BufferGeometry {
  const yokeProfile = TORSO_PROFILE.slice(6);
  const geo = latheFromProfile(yokeProfile, 1.012, -0.004);
  geo.applyMatrix4(new Matrix4().makeScale(1, 1, JERSEY_DIMENSIONS.flattenZ));
  return geo;
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
  const cuffRadius = SLEEVE_TOP_RADIUS * SLEEVE_CUFF_RATIO[variant];
  const geo = new CylinderGeometry(SLEEVE_TOP_RADIUS, cuffRadius, length, 32, 12, false);

  // Shift so the shoulder cap sits at y=0 and the tube extends downward.
  geo.applyMatrix4(new Matrix4().makeTranslation(0, -length / 2, 0));

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, -pos.getY(i) / length));
    if (variant === "long") {
      // Elbow pinch at ~55% + forward bend growing quadratically.
      const pinch = 1 - 0.09 * Math.exp(-(((t - 0.55) / 0.14) ** 2));
      pos.setX(i, pos.getX(i) * pinch);
      pos.setZ(i, pos.getZ(i) * pinch + 0.34 * t * t);
    } else {
      // Short sleeves flare slightly outward at the cuff opening.
      const flare = 1 + 0.1 * t;
      pos.setX(i, pos.getX(i) * flare);
      pos.setZ(i, pos.getZ(i) * flare + 0.06 * t * t);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const mirror = side === "left" ? 1 : -1;
  const direction = new Vector3(
    mirror * Math.sin(JERSEY_DIMENSIONS.sleeveTiltZ),
    -Math.cos(JERSEY_DIMENSIONS.sleeveTiltZ),
    Math.sin(JERSEY_DIMENSIONS.sleeveTiltX),
  ).normalize();
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), direction);
  geo.applyQuaternion(quaternion);
  geo.applyMatrix4(
    new Matrix4().makeTranslation(
      mirror * JERSEY_DIMENSIONS.sleeveAnchorX,
      JERSEY_DIMENSIONS.sleeveAnchorY,
      0,
    ),
  );
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
  };
}

export function disposeJerseyGeometries(bundle: JerseyGeometryBundle): void {
  for (const key of Object.keys(bundle) as (keyof JerseyGeometryBundle)[]) {
    bundle[key]?.dispose();
  }
}
