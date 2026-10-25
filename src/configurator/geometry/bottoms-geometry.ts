import {
  BufferGeometry,
  ExtrudeGeometry,
  Matrix4,
  Shape,
  TorusGeometry,
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

function extrudeBottomShape(shape: Shape, depth = 0.42, bevelSize = 0.025): BufferGeometry {
  const geo = new ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 24,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize,
    bevelThickness: 0.02,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

function buildHipGeometry(): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(-0.36, 1.2);
  shape.quadraticCurveTo(-0.5, 1.28, -0.51, 1.42);
  shape.lineTo(-0.49, 1.5);
  shape.lineTo(0.49, 1.5);
  shape.lineTo(0.51, 1.42);
  shape.quadraticCurveTo(0.5, 1.28, 0.36, 1.2);
  shape.closePath();
  return extrudeBottomShape(shape);
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
  const [topR, hemR] = LEG_RADII[variant];
  const mirror = side === "left" ? 1 : -1;
  const centerTop = mirror * BOTTOM_DIMENSIONS.legCenterX;
  const centerHem = mirror * (BOTTOM_DIMENSIONS.legCenterX + 0.025);
  const shape = new Shape();
  shape.moveTo(centerTop - topR, topY);
  shape.quadraticCurveTo(centerTop - topR * 1.03, (topY + hemY) / 2, centerHem - hemR, hemY);
  shape.lineTo(centerHem + hemR, hemY);
  shape.quadraticCurveTo(centerTop + topR * 1.03, (topY + hemY) / 2, centerTop + topR, topY);
  shape.closePath();
  return extrudeBottomShape(shape, 0.4, 0.022);
}

/** Hem band hugging each leg opening. */
function buildHemGeometry(variant: BottomVariant, side: "left" | "right"): BufferGeometry {
  const hemY = LEG_HEM_Y[variant];
  const hemR = LEG_RADII[variant][1] * 1.02;
  const mirror = side === "left" ? 1 : -1;
  const center = mirror * (BOTTOM_DIMENSIONS.legCenterX + 0.025);
  const shape = new Shape();
  shape.moveTo(center - hemR, hemY);
  shape.lineTo(center + hemR, hemY);
  shape.lineTo(center + hemR, hemY + 0.065);
  shape.lineTo(center - hemR, hemY + 0.065);
  shape.closePath();
  return extrudeBottomShape(shape, 0.415, 0.01);
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
