import { useEffect, useMemo } from "react";
import type { ComponentType } from "react";
import type { GarmentConfig, ProductGarmentDescriptor } from "./model";
import {
  FALLBACK_RENDERER_KEY,
  RENDERER_SCOPE,
  resolveGarmentRenderer,
  type GarmentRendererKey,
  type RendererResolution,
} from "./registry";
import { SportsJersey, type GarmentModelProps } from "./garments/SportsJersey";
import { HoodieGarment } from "./garments/HoodieGarment";
import { BottomsGarment } from "./garments/BottomsGarment";
import { BundleGarment } from "./garments/BundleGarment";
import { FallbackGarment } from "./garments/FallbackGarment";
import { AccessoryGarment } from "./garments/AccessoryGarment";
import { GlbGarment } from "./garments/GlbGarment";

/** GLB-first wrappers: real garment model when the file exists, procedural otherwise. */
function JerseyRenderer(props: GarmentModelProps) {
  return <GlbGarment rendererKey="sports-jersey" fallback={SportsJersey} {...props} />;
}
function HoodieRenderer(props: GarmentModelProps) {
  return <GlbGarment rendererKey="hoodie" fallback={HoodieGarment} {...props} />;
}
function BottomsRenderer(props: GarmentModelProps) {
  return <GlbGarment rendererKey="bottoms" fallback={BottomsGarment} {...props} />;
}
function AccessoryRenderer(props: GarmentModelProps) {
  return <GlbGarment rendererKey="accessory" fallback={AccessoryGarment} {...props} />;
}

/**
 * Renderer key → model component. Keys come from the pure registry so the
 * mapping stays declarative and testable; every key must be covered.
 */
export const GARMENT_RENDERERS: Record<GarmentRendererKey, ComponentType<GarmentModelProps>> = {
  "sports-jersey": JerseyRenderer,
  hoodie: HoodieRenderer,
  bottoms: BottomsRenderer,
  bundle: BundleGarment,
  accessory: AccessoryRenderer,
  "generic-garment": FallbackGarment,
};

export type ProductGarmentProps = {
  descriptor?: ProductGarmentDescriptor | null;
  config: GarmentConfig;
  assetUrls?: Record<string, string>;
  /** Reports the resolution when it changes — useful for debug surfaces. */
  onResolved?: (resolution: RendererResolution) => void;
};

/**
 * Resolves the product's renderer through the registry and mounts it.
 * Resolution always succeeds — unmatched products get the explicit fallback.
 *
 * The wrapper group is tagged with `userData.scope` ("upper" | "lower") so
 * the decal layer can raycast zones only against surfaces that can actually
 * host them. Bundles tag each component inside BundleGarment instead, so the
 * outer wrapper intentionally carries no scope.
 */
export function ProductGarment({ descriptor, config, assetUrls, onResolved }: ProductGarmentProps) {
  const resolution = useMemo(
    () => resolveGarmentRenderer(descriptor),
    [descriptor],
  );
  const Model = GARMENT_RENDERERS[resolution.key] ?? GARMENT_RENDERERS[FALLBACK_RENDERER_KEY];
  const scope = resolution.key === "bundle" ? undefined : RENDERER_SCOPE[resolution.key];

  useEffect(() => {
    onResolved?.(resolution);
  }, [onResolved, resolution]);

  return (
    <group name={`scope-${scope ?? "none"}`} userData={{ scope }}>
      <Model config={config} descriptor={descriptor} assetUrls={assetUrls} />
    </group>
  );
}
