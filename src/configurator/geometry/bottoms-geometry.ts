import {
  BufferGeometry,
  CylinderGeometry,
  LatheGeometry,
  Matrix4,
  TorusGeometry,
  Vector2,
} from "three";

/**
 * Procedural bottoms (pantalón / bermuda / short / calza): an oval hip lathe
 * under a ribbed waistband, and two tapered legs split by an inseam gap.
 * Same construction discipline as the jersey — real curved volumes, baked
 * matrices, deterministic output, no external assets.
 *
 * Anchor convention: waistband sits at y≈1.5 (same height as the jersey neck)
 * so a standalone bottom fills the same camera frame; legs extend downward.
 */

export type BottomVariant = "long" | "bermuda" | "short" | "slim";

export const BOTTOM_DIMENSIONS = {
  /** Waistline height — matches the jersey neckline for frame coherence. */
  waistY: 1.5,
  waistRadius: 0.5,
  /** Front-to-back flattening — hips are oval like the torso. */
  flattenZ: 0.62,
  /** Leg axis centre offsets from the middle. */
  legCenterX: 0.27,
} as const;

export type BottomsGeometryBundle = {
  hip: BufferGeometry;
  waistband: BufferGeometry;
  legLeft: BufferGeometry;
  legRight: BufferGeometry;
  hemLeft: BufferGeometry;
  hemRight: BufferGeometry;
};

/** Hem height per variant — the leg ends here. */
const LEG_HEM_Y: Record<BottomVariant, number> = {
  long: 0.06,
  slim: 0.1,
  bermuda: 0.78,
  short: 1.0,
};

/** Leg tube radii (top → hem). Slim fits tighter (calza). */
const LEG_RADII: Record<BottomVariant, [number, number]> = {
  long: [0.24, 0.19],
  slim: [0.21, 0.155],
  bermuda: [0.26, 0.24],
  short: [0.26, 0.25],
};

/** Hip outline: waistband under-hem (y=1.28) up to the waist top. */
const HIP_PROFILE: readonly [number, number][] = [
  [0.36, 1.24],
  [0.46, 1.3],
  [0.51, 1.38],
  [0.5, 1.46],
  [BOTTOM_DIMENSIONS.waistRadius, BOTTOM_DIMENSIONS.waistY],
];

function ovalize(geo: BufferGeometry): BufferGeometry {
  geo.applyMatrix4(new Matrix4().makeScale(1, 1, BOTTOM_DIMENSIONS.flattenZ));
  return geo;
}

function buildHipGeometry(): BufferGeometry {
  const points = HIP_PROFILE.map(([r, y]) => new Vector2(r, y));
  return ovalize(new LatheGeometry(points, 48));
}

function buildWaistbandGeometry(): BufferGeometry {
  const geo = new TorusGeometry(BOTTOM_DIMENSIONS.waistRadius + 0.008, 0.045, 16, 48);
  geo.applyMatrix4(new Matrix4().makeRotationX(Math.PI / 2));
  geo.applyMatrix4(new Matrix4().makeScale(1, 1, BOTTOM_DIMENSIONS.flattenZ));
  geo.applyMatrix4(new Matrix4().makeTranslation(0, BOTTOM_DIMENSIONS.waistY + 0.01, 0));
  return geo;
}

/**
 * One leg tube from the crotch (y≈1.24) down to the variant's hem, centred at
 * ±legCenterX with a slight outward cant and a mild forward ease near the hem.
 */
function buildLegGeometry(variant: BottomVariant, side: "left" | "right"): BufferGeometry {
  const hemY = LEG_HEM_Y[variant];
  const topY = 1.26;
  const length = topY - hemY;
  const [topR, hemR] = LEG_RADII[variant];
  const geo = new CylinderGeometry(topR, hemR, length, 36, 8, false);
  geo.applyMatrix4(new Matrix4().makeTranslation(0, hemY + length / 2, 0));

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (topY - pos.getY(i)) / length));
    // Gentle taper curve: thighs fuller, hem looser on open variants.
    const fullness = variant === "slim" ? 1 - 0.05 * t : 1 + 0.04 * t;
    pos.setX(i, pos.getX(i) * fullness);
    pos.setZ(i, pos.getZ(i) * fullness + 0.05 * t * t);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const mirror = side === "left" ? 1 : -1;
  geo.applyMatrix4(
    new Matrix4().makeRotationZ(mirror * -0.035),
  );
  geo.applyMatrix4(new Matrix4().makeTranslation(mirror * BOTTOM_DIMENSIONS.legCenterX, 0, 0));
  return geo;
}

/** Hem band hugging each leg opening. */
function buildHemGeometry(variant: BottomVariant, side: "left" | "right"): BufferGeometry {
  const hemY = LEG_HEM_Y[variant];
  const hemR = LEG_RADII[variant][1] * 1.02 + 0.008;
  const geo = new CylinderGeometry(hemR, hemR, 0.07, 36, 1, true);
  const mirror = side === "left" ? 1 : -1;
  // Slight outward tilt mirrors the leg's rotation cant.
  geo.applyMatrix4(new Matrix4().makeRotationZ(mirror * -0.035));
  geo.applyMatrix4(
    new Matrix4().makeTranslation(mirror * (BOTTOM_DIMENSIONS.legCenterX - 0.02), hemY + 0.03, 0.05),
  );
  return geo;
}

export function buildBottomsGeometries(variant: BottomVariant): BottomsGeometryBundle {
  return {
    hip: buildHipGeometry(),
    waistband: buildWaistbandGeometry(),
    legLeft: buildLegGeometry(variant, "left"),
    legRight: buildLegGeometry(variant, "right"),
    hemLeft: buildHemGeometry(variant, "left"),
    hemRight: buildHemGeometry(variant, "right"),
  };
}

export function disposeBottomsGeometries(bundle: BottomsGeometryBundle): void {
  for (const key of Object.keys(bundle) as (keyof BottomsGeometryBundle)[]) {
    bundle[key]?.dispose();
  }
}
