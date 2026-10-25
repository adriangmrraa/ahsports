import {
  Box3,
  Color,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Vector3,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import type { GarmentConfig, ProductGarmentDescriptor } from "./model";
import type { GarmentRendererKey } from "./registry";
import { bottomVariantFor } from "./garments/BottomsGarment";
import { FABRIC_WEAVE_TEXTURE } from "./fabric-texture";

/**
 * Real-garment GLB pipeline. Free/licensed garment models ship under
 * `public/models/garments/` and are normalized into the same "garment units"
 * space the procedural geometry occupies — so zone aims, decal projection,
 * camera presets and the stage floor keep working unchanged on real meshes.
 *
 * Adoption is progressive and honest: `glbCandidatesFor` lists preferred
 * files per product shape; the viewer probes them and falls back to the
 * procedural renderer when no file exists yet (or the load fails).
 */

export type BottomVariantHint = ReturnType<typeof bottomVariantFor>;

/**
 * Candidate model URLs in preference order — first reachable file wins.
 * A more specific silhouette (sleeveless, bermuda) precedes the generic
 * family file so a missing specialist model degrades to the family model
 * and only then to the procedural geometry.
 */
export function glbCandidatesFor(
  key: GarmentRendererKey,
  config: Pick<GarmentConfig, "sleeves">,
  descriptor?: ProductGarmentDescriptor | null,
): string[] {
  const dir = "/models/garments";
  switch (key) {
    case "sports-jersey":
      if (config.sleeves === "sleeveless")
        return [`${dir}/sleeveless.glb`, `${dir}/jersey.glb`];
      if (config.sleeves === "long")
        return [`${dir}/jersey-long.glb`, `${dir}/jersey.glb`];
      return [`${dir}/jersey.glb`];
    case "hoodie":
      return [`${dir}/hoodie.glb`];
    case "bottoms": {
      const variant = descriptor ? bottomVariantFor(descriptor) : "long";
      const specific =
        variant === "short"
          ? "shorts"
          : variant === "bermuda"
            ? "bermuda"
            : "pants";
      return [`${dir}/${specific}.glb`, `${dir}/bottoms.glb`];
    }
    case "accessory":
      return [`${dir}/accessory.glb`];
    // Bundles compose their components individually; generic stays procedural.
    default:
      return [];
  }
}

/**
 * Target envelope per family, measured from the procedural geometry so a
 * normalized GLB lands where zone aims and the camera already expect it.
 * Values: garment-units height; `topY` aligns the model's bounding-box top.
 */
const FAMILY_ENVELOPES: Record<string, { height: number; topY: number }> = {
  "sports-jersey": { height: 1.68, topY: 1.64 },
  hoodie: { height: 1.96, topY: 1.93 },
  bottoms: { height: 1.55, topY: 1.55 },
  accessory: { height: 1.2, topY: 1.35 },
};

export type NormalizeOptions = {
  height?: number;
  topY?: number;
  /** Rotate π so a -Z-facing model faces +Z (many exports face backwards). */
  flip?: boolean;
};

/**
 * Wraps a loaded GLB scene in a group that is uniformly scaled to the
 * family's garment-units height and re-centered so its bbox top sits at
 * `topY` with X/Z centered on the origin. Pure math — unit-testable
 * without WebGL or an actual .glb file.
 */
export function normalizeGarmentScene(source: Object3D, key: GarmentRendererKey, opts: NormalizeOptions = {}): Group {
  const envelope = FAMILY_ENVELOPES[key] ?? { height: 1.68, topY: 1.64 };
  const height = opts.height ?? envelope.height;
  const topY = opts.topY ?? envelope.topY;

  const wrapper = new Group();
  wrapper.name = `glb-${key}`;
  wrapper.add(source);

  const box = new Box3().setFromObject(source);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  if (size.y <= 1e-6 || !Number.isFinite(size.y)) return wrapper;

  const scale = height / size.y;
  source.scale.setScalar(scale);
  if (opts.flip) source.rotation.y = Math.PI;
  source.position.set(-center.x * scale, topY - box.max.y * scale, -center.z * scale);
  return wrapper;
}

/** Material-name heuristic → which config color slot owns the surface. */
export type MaterialSlot = "primary" | "secondary" | "accent";

const ACCENT_RE = /collar|cuff|rib|neck(?:band)?|hem|waistband|waist|placket|zip|drawstring|lace|button|pocket|binding|elastic|drawcord|grommet|eyelet|label|tag|hood.?lin/i;
const SECONDARY_RE = /secondary|contrast|side|panel|yoke|stripe|insert|inset|accent|trim.?panel|color.?block/i;

/**
 * Classifies a GLB material name into a config color slot. Real garment
 * exports name materials inconsistently ("Fabric", "Collar_Rib", "MAT.002"),
 * so unknown names default to `primary` — the body is always the dominant
 * surface. Exported for the test suite.
 */
export function classifyMaterialSlot(materialName: string): MaterialSlot {
  if (ACCENT_RE.test(materialName)) return "accent";
  if (SECONDARY_RE.test(materialName)) return "secondary";
  return "primary";
}

const toStandard = (material: Material): MeshStandardMaterial => {
  // Always return a fresh instance: the cached GLTF scene shares materials
  // across mounts, so mutating in place would leak tints between viewers.
  if (material instanceof MeshStandardMaterial) return material.clone();
  // Unlit/legacy materials (MeshBasicMaterial from KHR_materials_unlit, Phong,
  // Lambert) don't respond to the studio lighting — rebuild them as Standard
  // preserving color/map/transparency so the model shades like cloth.
  const src = material as MeshStandardMaterial;
  const standard = new MeshStandardMaterial({
    color: src.color instanceof Color ? src.color.clone() : new Color(0xffffff),
    map: src.map ?? null,
    transparent: material.transparent,
    opacity: material.opacity,
    side: material.side,
    roughness: 0.85,
    metalness: 0,
  });
  standard.name = material.name;
  return standard;
};

export type ApplyConfigOptions = {
  /** Sublimation pattern texture (already wrapping + repeating), or null. */
  pattern?: Texture | null;
  /** Fine cloth weave used as bump map so flat GLB surfaces read as textile. */
  weave?: Texture | null;
};

/**
 * Applies the GarmentConfig to a normalized GLB scene: tint materials by
 * name-classified slot, keep the model's baked texture as cloth detail
 * (color multiplies over it), swap in the sublimation pattern on body
 * surfaces, and enable shadows. Materials are cloned per mesh first —
 * useLoader caches share the source scene across mounts.
 */
export function applyGarmentConfig(
  root: Object3D,
  config: GarmentConfig,
  { pattern = null, weave = FABRIC_WEAVE_TEXTURE }: ApplyConfigOptions = {},
): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.castShadow = true;
    node.receiveShadow = true;

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const next = materials.map((material) => {
      const std = toStandard(material);
      const slot = classifyMaterialSlot(std.name || material.name || "");
      const isBody = slot === "primary";

      std.color = new Color(pattern && isBody ? "#ffffff" : config.colors[slot]);
      if (pattern && isBody) std.map = pattern;
      if (std instanceof MeshPhysicalMaterial) std.clearcoat = Math.min(std.clearcoat, 0.2);
      std.roughness = Math.max(std.roughness, 0.72);
      std.metalness = 0;
      if (weave && !std.bumpMap) {
        std.bumpMap = weave;
        std.bumpScale = 0.004;
      }
      std.needsUpdate = true;
      return std;
    });

    node.material = Array.isArray(node.material) ? next : next[0];
  });
}
