import { useEffect, useMemo } from "react";
import type { Texture } from "three";
import type { GarmentConfig, HexColor, ProductGarmentDescriptor } from "../model";
import { fabricVisualPreset, type FabricVisualPreset } from "../render-tokens";
import { buildJerseyGeometries, disposeJerseyGeometries } from "../geometry/jersey-geometry";
import { FABRIC_WEAVE_TEXTURE } from "../fabric-texture";
import { useSublimationTexture } from "../sublimation-texture";

export type GarmentModelProps = {
  config: GarmentConfig;
  /** Structural product info — renderers that need variants (bottoms length, bundle components) read it. */
  descriptor?: ProductGarmentDescriptor | null;
  /** Attachment id → URL, shared by base sublimation and decal renderers. */
  assetUrls?: Record<string, string>;
};

function FabricMaterial({ color, preset, pattern }: { color: HexColor; preset: FabricVisualPreset; pattern?: Texture | null }) {
  return (
    <meshPhysicalMaterial
      color={pattern ? "#ffffff" : color}
      map={pattern ?? undefined}
      roughness={preset.roughness}
      metalness={0}
      sheen={preset.sheen}
      sheenRoughness={preset.sheenRoughness}
      sheenColor={preset.sheenColor}
      clearcoat={preset.clearcoat}
      clearcoatRoughness={preset.clearcoatRoughness}
      envMapIntensity={preset.envMapIntensity}
      bumpMap={FABRIC_WEAVE_TEXTURE}
      bumpScale={0.018}
      roughnessMap={FABRIC_WEAVE_TEXTURE}
    />
  );
}

/**
 * Modular sports jersey: torso, shoulder yoke, collar and both sleeves are
 * separate meshes so zones can take independent colors — and later, decals.
 * Geometry is procedural and deterministic; materials react to GarmentConfig.
 */
export function SportsJersey({ config, assetUrls }: GarmentModelProps) {
  const { collar, sleeves } = config;
  const geometries = useMemo(() => buildJerseyGeometries({ collar, sleeves }), [collar, sleeves]);

  // The renderer owns these geometries — dispose them on rebuild/unmount.
  useEffect(() => () => disposeJerseyGeometries(geometries), [geometries]);

  const fabric = fabricVisualPreset(config.fabric);
  const { primary, secondary, accent } = config.colors;
  const pattern = useSublimationTexture(
    config.sublimation ? (assetUrls?.[config.sublimation.assetRef] ?? null) : null,
    config.sublimation?.repeat ?? 2,
  );

  return (
    <group name="sports-jersey">
      <mesh castShadow geometry={geometries.torso}>
        <FabricMaterial color={primary} preset={fabric} pattern={pattern} />
      </mesh>
      <mesh castShadow geometry={geometries.yoke}>
        <FabricMaterial color={secondary} preset={fabric} pattern={pattern} />
      </mesh>
      <mesh geometry={geometries.graphicPanel}>
        <FabricMaterial color={secondary} preset={fabric} pattern={pattern} />
      </mesh>
      <mesh geometry={geometries.accentStripe}>
        <FabricMaterial color={accent} preset={fabric} />
      </mesh>
      <mesh castShadow geometry={geometries.collar}>
        <FabricMaterial color={accent} preset={fabric} />
      </mesh>
      {geometries.sleeveLeft && (
        <mesh castShadow geometry={geometries.sleeveLeft}>
          <FabricMaterial color={primary} preset={fabric} pattern={pattern} />
        </mesh>
      )}
      {geometries.sleeveRight && (
        <mesh castShadow geometry={geometries.sleeveRight}>
          <FabricMaterial color={primary} preset={fabric} pattern={pattern} />
        </mesh>
      )}
      {geometries.cuffLeft && (
        <mesh geometry={geometries.cuffLeft}>
          <FabricMaterial color={accent} preset={fabric} />
        </mesh>
      )}
      {geometries.cuffRight && (
        <mesh geometry={geometries.cuffRight}>
          <FabricMaterial color={accent} preset={fabric} />
        </mesh>
      )}
      {geometries.armholeLeft && (
        <mesh geometry={geometries.armholeLeft}>
          <FabricMaterial color={accent} preset={fabric} />
        </mesh>
      )}
      {geometries.armholeRight && (
        <mesh geometry={geometries.armholeRight}>
          <FabricMaterial color={accent} preset={fabric} />
        </mesh>
      )}
    </group>
  );
}
