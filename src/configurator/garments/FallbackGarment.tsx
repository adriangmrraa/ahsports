import { useEffect, useMemo } from "react";
import type { GarmentModelProps } from "./SportsJersey";
import { fabricVisualPreset, SCENE_TOKENS } from "../render-tokens";
import { buildCollarGeometry, buildTorsoGeometry } from "../geometry/jersey-geometry";

/**
 * Explicit fallback renderer: a neutral torso shell in a muted tone so a
 * product without a dedicated model still previews a garment volume — and is
 * visually obvious it is not the final asset.
 */
export function FallbackGarment({ config }: GarmentModelProps) {
  const geometries = useMemo(
    () => ({ torso: buildTorsoGeometry(), collar: buildCollarGeometry("crew") }),
    [],
  );

  useEffect(
    () => () => {
      geometries.torso.dispose();
      geometries.collar.dispose();
    },
    [geometries],
  );

  const fabric = fabricVisualPreset(config.fabric);

  return (
    <group name="generic-garment">
      <mesh castShadow geometry={geometries.torso}>
        <meshPhysicalMaterial
          color={SCENE_TOKENS.fallbackGarment}
          roughness={fabric.roughness}
          sheen={fabric.sheen}
          sheenRoughness={fabric.sheenRoughness}
          envMapIntensity={fabric.envMapIntensity}
        />
      </mesh>
      <mesh geometry={geometries.collar}>
        <meshPhysicalMaterial color={config.colors.accent} roughness={0.7} />
      </mesh>
    </group>
  );
}
