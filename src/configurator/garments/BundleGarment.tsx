import { useMemo, type ComponentType } from "react";
import { RENDERER_SCOPE, resolveGarmentRenderer } from "../registry";
import { FallbackGarment } from "./FallbackGarment";
import { SportsJersey, type GarmentModelProps } from "./SportsJersey";
import { HoodieGarment } from "./HoodieGarment";
import { BottomsGarment } from "./BottomsGarment";

/**
 * Local renderer map for bundle components — deliberately not imported from
 * renderers.tsx so the graph stays acyclic (renderers → BundleGarment →
 * garments only). A bundle inside a bundle is rejected by product
 * validation; if a descriptor ever nests one, it resolves to the fallback.
 */
const COMPONENT_RENDERERS: Record<string, ComponentType<GarmentModelProps>> = {
  "sports-jersey": SportsJersey,
  hoodie: HoodieGarment,
  bottoms: BottomsGarment,
  "generic-garment": FallbackGarment,
};

/** Renders one bundle component through the registry. */
function ComponentGarment({ config, descriptor, assetUrls }: GarmentModelProps) {
  const resolution = useMemo(() => resolveGarmentRenderer(descriptor), [descriptor]);
  const Model = COMPONENT_RENDERERS[resolution.key] ?? FallbackGarment;
  return <Model config={config} descriptor={descriptor} assetUrls={assetUrls} />;
}

/**
 * Conjunto renderer: draws each real component product with its own family
 * renderer, laid out side by side as an outfit. Each component is wrapped in
 * a scope-tagged group (`userData.scope`) so the decal layer raycasts upper
 * zones against upper garments and leg zones against bottoms only.
 *
 * A component-less bundle falls back honestly instead of drawing empty space.
 */
export function BundleGarment({ config, descriptor, assetUrls }: GarmentModelProps) {
  const resolved = useMemo(
    () =>
      (descriptor?.components ?? []).map((component) => ({
        component,
        resolution: resolveGarmentRenderer(component),
      })),
    [descriptor],
  );

  if (resolved.length === 0) return <FallbackGarment config={config} assetUrls={assetUrls} />;

  // Side-by-side outfit layout: each garment keeps its own canonical frame
  // (zone aims stay in component-local space; the group offset is absorbed by
  // matrixWorld during decal projection).
  const spread = 0.62;
  const start = -((resolved.length - 1) * spread) / 2;

  return (
    <group name="bundle">
      {resolved.map(({ component, resolution }, i) => {
        const scope = RENDERER_SCOPE[resolution.key];
        return (
          <group
            key={i}
            name={`component-${scope}`}
            userData={{ scope }}
            position={[start + i * spread, 0, 0]}
            scale={0.82}
          >
            <ComponentGarment config={config} descriptor={component} assetUrls={assetUrls} />
          </group>
        );
      })}
    </group>
  );
}
