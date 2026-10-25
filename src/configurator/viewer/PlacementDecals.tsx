import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import {
  Euler,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Raycaster,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  type Group,
  type Intersection,
} from "three";
import type { GarmentZone, VisualAssetPlacement } from "../model";

/**
 * Real on-mesh placement rendering. For every configured placement with a
 * resolvable image, a ray from the zone's outward direction hits the garment
 * surface; the returned point+normal orients a DecalGeometry projector that
 * clips the texture onto the actual curved mesh — no fake HTML overlay, no
 * floating quad. A placement whose ray misses (e.g. sleeve zone on a
 * sleeveless product) stays persisted in the config and simply skips drawing.
 */

type Decal = { key: string; geometry: DecalGeometry; material: MeshStandardMaterial };

/** Nominal decal footprint in garment units at scale=1. */
const BASE_DECAL_SIZE = 0.42;
/** Projection depth — must clear the curvature so the decal wraps the cloth. */
const PROJECTOR_DEPTH = 0.55;
/** Lateral/vertical span a zone's anchor can sweep, in garment units. */
const ZONE_SPAN = { x: 0.22, y: 0.2 } as const;

type ZoneRay = { origin: Vector3; direction: Vector3 };

/**
 * Zone → surface aim in garment-local space. The garment faces +Z; its left
 * side is +X (a person facing you has their left on your right). Each entry is
 * { aim, out } — a point inside the body under the intended surface patch and
 * the zone's outward-facing direction. The ray is cast from aim + out·R back
 * along −out, so it always lands on the surface covering that zone.
 */
const ZONE_SURFACES: Record<GarmentZone, { aim: [number, number, number]; out: [number, number, number] }> = {
  "front-center": { aim: [0, 1.02, 0.32], out: [0, -0.04, 1] },
  "chest-left": { aim: [0.26, 1.24, 0.3], out: [0.42, 0.05, 0.9] },
  "chest-right": { aim: [-0.26, 1.24, 0.3], out: [-0.42, 0.05, 0.9] },
  "back-upper": { aim: [0, 1.3, -0.3], out: [0, 0.05, -1] },
  "back-lower": { aim: [0, 0.8, -0.3], out: [0, -0.03, -1] },
  "sleeve-left": { aim: [0.7, 1.16, 0.08], out: [0.96, -0.06, 0.12] },
  "sleeve-right": { aim: [-0.7, 1.16, 0.08], out: [-0.96, -0.06, 0.12] },
  // Leg tubes live at x≈±0.27 (bottoms geometry). y=1.08 sits mid-thigh —
  // below the crotch on every variant yet above even the shortest hem, so
  // shorts/bermudas still have surface where the ray lands.
  "leg-left": { aim: [0.27, 1.08, 0.17], out: [0.18, 0, 0.98] },
  "leg-right": { aim: [-0.27, 1.08, 0.17], out: [-0.18, 0, 0.98] },
};

/**
 * Which surface class each zone lives on. Legs only exist on lower garments;
 * everything else is upper-body. In bundles the raycast only targets the
 * scope groups that can host the zone — a chest logo can never land on the
 * pants, a leg logo never on the jersey.
 */
const ZONE_SCOPE: Record<GarmentZone, "upper" | "lower"> = {
  "front-center": "upper",
  "chest-left": "upper",
  "chest-right": "upper",
  "back-upper": "upper",
  "back-lower": "upper",
  "sleeve-left": "upper",
  "sleeve-right": "upper",
  "leg-left": "lower",
  "leg-right": "lower",
};

/**
 * Raycast scopes inside the garment tree. ProductGarment/BundleGarment tag
 * each garment's root group with `userData.scope`; when the tree carries no
 * tags at all (tests, legacy callers) the root itself serves every scope.
 */
function resolveScopes(root: Object3D, scope: "upper" | "lower"): Object3D[] {
  const tagged: Object3D[] = [];
  let anyTagged = false;
  root.traverse((node) => {
    if (typeof node.userData?.scope === "string") {
      anyTagged = true;
      if (node.userData.scope === scope) tagged.push(node);
    }
  });
  return anyTagged ? tagged : [root];
}

const RAY_DISTANCE = 2.6;

function zoneRay(zone: GarmentZone, p: VisualAssetPlacement): ZoneRay {
  const { aim, out } = ZONE_SURFACES[zone];
  const outward = new Vector3(...out).normalize();
  // Lateral axis: perpendicular to the outward dir in its horizontal plane —
  // u slides the decal sideways, v slides it vertically (v=0 is the top edge).
  const lateral = new Vector3().crossVectors(new Vector3(0, 1, 0), outward).normalize();
  const aimPoint = new Vector3(...aim)
    .addScaledVector(lateral, (p.anchor.u - 0.5) * ZONE_SPAN.x)
    .addScaledVector(new Vector3(0, 1, 0), (0.5 - p.anchor.v) * ZONE_SPAN.y);
  return {
    origin: aimPoint.clone().addScaledVector(outward, RAY_DISTANCE),
    direction: outward.negate(),
  };
}

const textureLoader = new TextureLoader();
textureLoader.setCrossOrigin("anonymous");

async function loadTexture(url: string): Promise<Texture | null> {
  try {
    const texture = await textureLoader.loadAsync(url);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  } catch {
    return null;
  }
}

/**
 * Projects one placement onto the garment: world-space raycast against the
 * group, decal box oriented so its projector axis matches the surface normal.
 * Returns null when nothing plausible is hit — the caller skips drawing.
 * Exported (pure math, no WebGL needed) so the node test suite can verify
 * projection on a real mesh.
 */
export function projectDecalGeometry(
  target: Object3D,
  placement: VisualAssetPlacement,
  aspect: number,
): DecalGeometry | null {
  if (!ZONE_SURFACES[placement.zone]) return null;

  target.updateWorldMatrix(true, true);

  // Cast against every subtree that can host this zone's surface class and
  // keep the closest hit — in bundles a zone may be hostable by more than one
  // component (e.g. two upper garments) and the front-most surface wins.
  let hit: Intersection | null = null;
  let bestDistance = Infinity;
  for (const scope of resolveScopes(target, ZONE_SCOPE[placement.zone])) {
    scope.updateWorldMatrix(true, true);
    const local = zoneRay(placement.zone, placement);
    const origin = local.origin.clone().applyMatrix4(scope.matrixWorld);
    const direction = local.direction.clone().transformDirection(scope.matrixWorld).normalize();

    const raycaster = new Raycaster(origin, direction);
    const hits = raycaster
      .intersectObject(scope, true)
      .filter((h) => h.object instanceof Mesh && h.face);
    const candidate = hits[0];
    if (candidate && candidate.distance < bestDistance) {
      hit = candidate;
      bestDistance = candidate.distance;
    }
  }
  const face = hit?.face;
  if (!hit || !face || !(hit.object instanceof Mesh)) return null;

  const normal = face.normal
    .clone()
    .transformDirection(hit.object.matrixWorld)
    .normalize();

  // Orientation: align the projector's +Z with the surface normal, then roll
  // by the placement rotation around that same axis.
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
  const orientation = new Euler().setFromQuaternion(quaternion);
  orientation.z += MathUtils.degToRad(placement.rotationDeg);

  const w = BASE_DECAL_SIZE * placement.scale;
  const size = new Vector3(w, w / Math.max(0.2, aspect), PROJECTOR_DEPTH);

  const geometry = new DecalGeometry(hit.object, hit.point, orientation, size);
  if (geometry.attributes.position?.count === 0) {
    geometry.dispose();
    return null;
  }
  return geometry;
}

function buildDecal(
  target: Object3D,
  placement: VisualAssetPlacement,
  texture: Texture,
): Decal | null {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const aspect = image?.width && image?.height ? image.width / image.height : 1;
  const geometry = projectDecalGeometry(target, placement, aspect);
  if (!geometry) return null;

  const material = new MeshStandardMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    roughness: 0.9,
    metalness: 0,
  });
  return { key: placement.id, geometry, material };
}

export type PlacementDecalsProps = {
  /** Group that wraps the garment meshes (raycast target). */
  target: React.RefObject<Group | null>;
  placements: readonly VisualAssetPlacement[];
  /** assetRef (attachment id) → public URL for the image. */
  assetUrls: Record<string, string>;
  /**
   * Geometry identity — bump when the surface shape changes (collar, sleeves,
   * product) so decals re-project instead of staying baked to the old mesh.
   */
  shapeKey: string;
};

export function PlacementDecals({ target, placements, assetUrls, shapeKey }: PlacementDecalsProps) {
  const [decals, setDecals] = useState<Decal[]>([]);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    let cancelled = false;
    const drawable = placements.filter((p) => p.assetRef && assetUrls[p.assetRef]);
    if (drawable.length === 0) {
      setDecals([]);
      invalidate();
      return;
    }

    void (async () => {
      const built: Decal[] = [];
      for (const placement of drawable) {
        const url = placement.assetRef ? assetUrls[placement.assetRef] : undefined;
        if (!url) continue;
        const texture = await loadTexture(url);
        if (cancelled || !texture) continue;
        const group = target.current;
        if (!group) continue;
        const decal = buildDecal(group, placement, texture);
        if (decal) built.push(decal);
        else texture.dispose();
      }
      if (cancelled) {
        for (const d of built) {
          d.geometry.dispose();
          d.material.dispose();
          d.material.map?.dispose();
        }
        return;
      }
      setDecals(built);
      invalidate();
    })();

    return () => {
      cancelled = true;
    };
  }, [placements, assetUrls, target, invalidate, shapeKey]);

  // Dispose geometries/materials/textures when the decal set rotates or unmounts.
  useEffect(() => {
    const rendered = decals;
    return () => {
      for (const d of rendered) {
        d.geometry.dispose();
        d.material.dispose();
        d.material.map?.dispose();
      }
    };
  }, [decals]);

  return (
    <group>
      {decals.map((d) => (
        <mesh key={d.key} geometry={d.geometry} material={d.material} />
      ))}
    </group>
  );
}
