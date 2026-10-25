import { useEffect, useMemo } from "react";
import type { Texture } from "three";
import type { HexColor } from "../model";
import { fabricVisualPreset, type FabricVisualPreset } from "../render-tokens";
import { buildHoodieGeometries, disposeHoodieGeometries } from "../geometry/hoodie-geometry";
import type { GarmentModelProps } from "./SportsJersey";
import { FABRIC_WEAVE_TEXTURE } from "../fabric-texture";
import { useSublimationTexture } from "../sublimation-texture";

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
      bumpScale={0.022}
      roughnessMap={FABRIC_WEAVE_TEXTURE}
    />
  );
}

/**
 * Campera/canguro family: fuller torso, hood, kangaroo pocket, ribbed hem and
 * cuffs, drawstrings. Fixed long sleeves, no collar — the hood is structural.
 */
export function HoodieGarment({ config, assetUrls }: GarmentModelProps) {
  const geometries = useMemo(() => buildHoodieGeometries(), []);
  useEffect(() => () => disposeHoodieGeometries(geometries), [geometries]);

  const fabric = fabricVisualPreset(config.fabric);
  const { primary, secondary, accent } = config.colors;
  const pattern = useSublimationTexture(
    config.sublimation ? (assetUrls?.[config.sublimation.assetRef] ?? null) : null,
    config.sublimation?.repeat ?? 2,
  );

  return (
    <group name="hoodie">
      <mesh castShadow geometry={geometries.torso}>
        <FabricMaterial color={primary} preset={fabric} pattern={pattern} />
      </mesh>
      <mesh castShadow geometry={geometries.hood}>
        <FabricMaterial color={secondary} preset={fabric} pattern={pattern} />
      </mesh>
      <mesh geometry={geometries.hoodInner}>
        <FabricMaterial color={accent} preset={fabric} />
      </mesh>
      <mesh geometry={geometries.pocket}>
        <FabricMaterial color={secondary} preset={fabric} pattern={pattern} />
      </mesh>
      <mesh geometry={geometries.hem}>
        <FabricMaterial color={accent} preset={fabric} />
      </mesh>
      <mesh castShadow geometry={geometries.sleeveLeft}>
        <FabricMaterial color={primary} preset={fabric} pattern={pattern} />
      </mesh>
      <mesh castShadow geometry={geometries.sleeveRight}>
        <FabricMaterial color={primary} preset={fabric} pattern={pattern} />
      </mesh>
      <mesh geometry={geometries.cuffLeft}>
        <FabricMaterial color={accent} preset={fabric} />
      </mesh>
      <mesh geometry={geometries.cuffRight}>
        <FabricMaterial color={accent} preset={fabric} />
      </mesh>
      <mesh geometry={geometries.drawstringLeft}>
        <FabricMaterial color={accent} preset={fabric} />
      </mesh>
      <mesh geometry={geometries.drawstringRight}>
        <FabricMaterial color={accent} preset={fabric} />
      </mesh>
    </group>
  );
}
