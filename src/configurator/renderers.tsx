import { useEffect, useMemo } from "react";
import type { ComponentType } from "react";
import type { GarmentConfig, ProductGarmentDescriptor } from "./model";
import {
  FALLBACK_RENDERER_KEY,
  resolveGarmentRenderer,
  type GarmentRendererKey,
  type RendererResolution,
} from "./registry";
import { SportsJersey, type GarmentModelProps } from "./garments/SportsJersey";
import { FallbackGarment } from "./garments/FallbackGarment";

/**
 * Renderer key → model component. Keys come from the pure registry so the
 * mapping stays declarative and testable; every key must be covered.
 */
export const GARMENT_RENDERERS: Record<GarmentRendererKey, ComponentType<GarmentModelProps>> = {
  "sports-jersey": SportsJersey,
  "generic-garment": FallbackGarment,
};

export type ProductGarmentProps = {
  descriptor?: ProductGarmentDescriptor | null;
  config: GarmentConfig;
  /** Reports the resolution when it changes — useful for debug surfaces. */
  onResolved?: (resolution: RendererResolution) => void;
};

/**
 * Resolves the product's renderer through the registry and mounts it.
 * Resolution always succeeds — unmatched products get the explicit fallback.
 */
export function ProductGarment({ descriptor, config, onResolved }: ProductGarmentProps) {
  const resolution = useMemo(
    () => resolveGarmentRenderer(descriptor),
    [descriptor],
  );
  const Model = GARMENT_RENDERERS[resolution.key] ?? GARMENT_RENDERERS[FALLBACK_RENDERER_KEY];

  useEffect(() => {
    onResolved?.(resolution);
  }, [onResolved, resolution]);

  return <Model config={config} />;
}
