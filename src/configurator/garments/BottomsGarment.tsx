import { useEffect, useMemo } from "react";
import type { Texture } from "three";
import type { HexColor } from "../model";
import { fabricVisualPreset, type FabricVisualPreset } from "../render-tokens";
import {
  buildBottomsGeometries,
  disposeBottomsGeometries,
  type BottomVariant,
} from "../geometry/bottoms-geometry";
import type { GarmentModelProps } from "./SportsJersey";
import { FABRIC_WEAVE_TEXTURE } from "../fabric-texture";
import { useSublimationTexture } from "../sublimation-texture";

/**
 * garmentType/garmentFamily → leg length. Structural fields only — a
 * "calza"/"legging" reads slim, bermuda/short keep their own lengths and
 * anything else defaults to the long pant silhouette.
 */
export function bottomVariantFor(descriptor: GarmentModelProps["descriptor"]): BottomVariant {
  const hint = `${descriptor?.garmentType ?? ""} ${descriptor?.garmentFamily ?? ""} ${descriptor?.productType ?? ""}`.toLowerCase();
  if (hint.includes("calza") || hint.includes("legging")) return "slim";
  if (hint.includes("bermuda")) return "bermuda";
  if (hint.includes("short")) return "short";
  return "long";
}

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
 * Bottoms family: hip + waistband + two tapered legs, hem bands in the accent
 * color. No collar/sleeve controls — legs carry the leg-left/leg-right decals.
 */
export function BottomsGarment({ config, descriptor, assetUrls }: GarmentModelProps) {
  const variant = bottomVariantFor(descriptor);
  const geometries = useMemo(() => buildBottomsGeometries(variant), [variant]);
  useEffect(() => () => disposeBottomsGeometries(geometries), [geometries]);

  const fabric = fabricVisualPreset(config.fabric);
  const { primary, accent } = config.colors;
  const pattern = useSublimationTexture(
    config.sublimation ? (assetUrls?.[config.sublimation.assetRef] ?? null) : null,
    config.sublimation?.repeat ?? 2,
  );

  return (
    <group name={`bottoms-${variant}`}>
      <mesh castShadow geometry={geometries.hip}>
        <FabricMaterial color={primary} preset={fabric} pattern={pattern} />
      </mesh>
      <mesh geometry={geometries.waistband}>
        <FabricMaterial color={accent} preset={fabric} />
      </mesh>
      <mesh castShadow geometry={geometries.legLeft}>
        <FabricMaterial color={primary} preset={fabric} pattern={pattern} />
      </mesh>
      <mesh castShadow geometry={geometries.legRight}>
        <FabricMaterial color={primary} preset={fabric} pattern={pattern} />
      </mesh>
      <mesh geometry={geometries.hemLeft}>
        <FabricMaterial color={accent} preset={fabric} />
      </mesh>
      <mesh geometry={geometries.hemRight}>
        <FabricMaterial color={accent} preset={fabric} />
      </mesh>
    </group>
  );
}
