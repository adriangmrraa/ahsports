import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useLoader, useThree } from "@react-three/fiber";
import { Mesh, type Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  applyGarmentConfig,
  glbCandidatesFor,
  normalizeGarmentScene,
} from "../glb-models";
import type { GarmentRendererKey } from "../registry";
import { useSublimationTexture } from "../sublimation-texture";
import type { GarmentModelProps } from "./SportsJersey";

/**
 * GLB-backed garment renderer. Loads the best available real garment model
 * for the renderer key + config shape, normalizes it into garment units, and
 * applies colors/sublimation to its materials. Every failure degrades one
 * level: specific file → generic family file → procedural renderer.
 */

type BoundaryProps = { children: ReactNode; onError: () => void; fallback: ReactNode };

/** Class boundary — R3F loaders throw during render, so a boundary is required. */
class GlbAssetBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[garment-viewer] GLB load failed, degrading", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function LoadedGlb({ url, rendererKey, config, assetUrls }: GarmentModelProps & { url: string; rendererKey: GarmentRendererKey }) {
  const gltf = useLoader(GLTFLoader, url);
  const invalidate = useThree((s) => s.invalidate);
  const pattern = useSublimationTexture(
    config.sublimation ? (assetUrls?.[config.sublimation.assetRef] ?? null) : null,
    config.sublimation?.repeat ?? 1,
  );

  const model = useMemo<Group>(() => {
    // SkeletonUtils.clone handles both static and skinned scenes; the cached
    // gltf.scene is shared across mounts so it must never be mutated.
    const cloned = cloneSkinned(gltf.scene);
    cloned.traverse((node) => {
      // Some source garments ship without vertex normals (MakeHuman OBJ
      // conversions) — light/shadow response needs them.
      if (node instanceof Mesh && !node.geometry.attributes.normal) {
        node.geometry.computeVertexNormals();
      }
    });
    return normalizeGarmentScene(cloned, rendererKey);
  }, [gltf, rendererKey]);

  useEffect(() => {
    applyGarmentConfig(model, config, { pattern });
    invalidate();
  }, [model, config, pattern, invalidate]);

  return <primitive object={model} />;
}

export type GlbGarmentProps = GarmentModelProps & {
  rendererKey: GarmentRendererKey;
  /** Procedural renderer used when no GLB file exists or the load fails. */
  fallback: ComponentType<GarmentModelProps>;
};

export function GlbGarment({ rendererKey, fallback: Fallback, ...props }: GlbGarmentProps) {
  const candidates = glbCandidatesFor(rendererKey, props.config, props.descriptor);
  const candidatesKey = candidates.join("|");
  const [index, setIndex] = useState(0);
  // Reset the chain when the product/config resolves to a different file list.
  useEffect(() => setIndex(0), [candidatesKey]);

  const url = candidates[index];
  if (!url) return <Fallback {...props} />;

  return (
    <GlbAssetBoundary
      key={url}
      onError={() => setIndex((i) => i + 1)}
      fallback={<Fallback {...props} />}
    >
      <Suspense fallback={null}>
        <LoadedGlb url={url} rendererKey={rendererKey} {...props} />
      </Suspense>
    </GlbAssetBoundary>
  );
}
