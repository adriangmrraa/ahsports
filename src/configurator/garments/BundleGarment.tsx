import { useMemo, type ComponentType } from "react";
import { RENDERER_SCOPE, resolveGarmentRenderer } from "../registry";
import { resolveComponentConfig } from "../model";
import { computeBundleLayout } from "../bundle-layout";
import { FallbackGarment } from "./FallbackGarment";
import { SportsJersey, type GarmentModelProps } from "./SportsJersey";
import { HoodieGarment } from "./HoodieGarment";
import { BottomsGarment } from "./BottomsGarment";
import { GlbGarment } from "./GlbGarment";

function JerseyComponent(props: GarmentModelProps) {
  return <GlbGarment rendererKey="sports-jersey" fallback={SportsJersey} {...props} />;
}
function HoodieComponent(props: GarmentModelProps) {
  return <GlbGarment rendererKey="hoodie" fallback={HoodieGarment} {...props} />;
}
function BottomsComponent(props: GarmentModelProps) {
  return <GlbGarment rendererKey="bottoms" fallback={BottomsGarment} {...props} />;
}

/**
 * Local renderer map for bundle components — deliberately not imported from
 * renderers.tsx so the graph stays acyclic (renderers → BundleGarment →
 * garments only). A bundle inside a bundle is rejected by product
 * validation; if a descriptor ever nests one, it resolves to the fallback.
 */
const COMPONENT_RENDERERS: Record<string, ComponentType<GarmentModelProps>> = {
  "sports-jersey": JerseyComponent,
  hoodie: HoodieComponent,
  bottoms: BottomsComponent,
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
 * a scope+component-tagged group so the decal layer raycasts a pinned
 * placement against that exact garment, and applies the component's own
 * config overrides (colors, collar, sleeves, sublimation).
 *
 * A component-less bundle falls back honestly instead of drawing empty space.
 */
export function BundleGarment({ config, descriptor, assetUrls, focusComponentId }: GarmentModelProps) {
  const resolved = useMemo(
    () =>
      (descriptor?.components ?? []).map((component) => ({
        component,
        resolution: resolveGarmentRenderer(component),
      })),
    [descriptor],
  );

  // Focus mode: render just the pinned component centered at full size.
  const visible = useMemo(
    () =>
      focusComponentId && resolved.some((r) => r.component.id === focusComponentId)
        ? resolved.filter((r) => r.component.id === focusComponentId)
        : resolved,
    [resolved, focusComponentId],
  );

  const layout = useMemo(
    () => computeBundleLayout(visible.map((r) => r.resolution.key)),
    [visible],
  );

  if (resolved.length === 0) return <FallbackGarment config={config} assetUrls={assetUrls} />;

  return (
    <group name="bundle" scale={layout.scale}>
      {visible.map(({ component, resolution }, i) => {
        const scope = RENDERER_SCOPE[resolution.key];
        return (
          <group
            key={component.id ?? i}
            name={`component-${scope}`}
            userData={{ scope, componentId: component.id }}
            position={[layout.offsets[i], 0, 0]}
          >
            <ComponentGarment
              config={resolveComponentConfig(config, component.id)}
              descriptor={component}
              assetUrls={assetUrls}
            />
          </group>
        );
      })}
    </group>
  );
}
