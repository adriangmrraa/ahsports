import { useEffect, useMemo } from "react";
import type { GarmentConfig, HexColor, ProductGarmentDescriptor } from "../model";
import { fabricVisualPreset, type FabricVisualPreset } from "../render-tokens";
import { buildJerseyGeometries, disposeJerseyGeometries } from "../geometry/jersey-geometry";

export type GarmentModelProps = {
  config: GarmentConfig;
  /** Structural product info — renderers that need variants (bottoms length, bundle components) read it. */
  descriptor?: ProductGarmentDescriptor | null;
};

function FabricMaterial({ color, preset }: { color: HexColor; preset: FabricVisualPreset }) {
  return (
    <meshPhysicalMaterial
      color={color}
      roughness={preset.roughness}
      metalness={0}
      sheen={preset.sheen}
      sheenRoughness={preset.sheenRoughness}
      sheenColor={preset.sheenColor}
      clearcoat={preset.clearcoat}
      clearcoatRoughness={preset.clearcoatRoughness}
      envMapIntensity={preset.envMapIntensity}
    />
  );
}

/**
 * Modular sports jersey: torso, shoulder yoke, collar and both sleeves are
 * separate meshes so zones can take independent colors — and later, decals.
 * Geometry is procedural and deterministic; materials react to GarmentConfig.
 */
export function SportsJersey({ config }: GarmentModelProps) {
  const { collar, sleeves } = config;
  const geometries = useMemo(() => buildJerseyGeometries({ collar, sleeves }), [collar, sleeves]);

  // The renderer owns these geometries — dispose them on rebuild/unmount.
  useEffect(() => () => disposeJerseyGeometries(geometries), [geometries]);

  const fabric = fabricVisualPreset(config.fabric);
  const { primary, secondary, accent } = config.colors;

  return (
    <group name="sports-jersey">
      <mesh castShadow geometry={geometries.torso}>
        <FabricMaterial color={primary} preset={fabric} />
      </mesh>
      <mesh castShadow geometry={geometries.yoke}>
        <FabricMaterial color={secondary} preset={fabric} />
      </mesh>
      <mesh castShadow geometry={geometries.collar}>
        <FabricMaterial color={accent} preset={fabric} />
      </mesh>
      {geometries.sleeveLeft && (
        <mesh castShadow geometry={geometries.sleeveLeft}>
          <FabricMaterial color={primary} preset={fabric} />
        </mesh>
      )}
      {geometries.sleeveRight && (
        <mesh castShadow geometry={geometries.sleeveRight}>
          <FabricMaterial color={primary} preset={fabric} />
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
