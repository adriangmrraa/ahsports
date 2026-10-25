import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import {
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";

/**
 * Loads an uploaded sublimation image as a sharp, repeatable color texture.
 * Rectangular images retain their source aspect ratio instead of being forced
 * into square tiles. The texture is local to its garment renderer and is
 * disposed whenever the selected asset changes.
 */
export function useSublimationTexture(url: string | null, repeat: number): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    let active = true;
    let loaded: Texture | null = null;
    setTexture(null);
    if (!url) {
      invalidate();
      return;
    }

    const loader = new TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (next) => {
        if (!active) {
          next.dispose();
          return;
        }
        loaded = next;
        const image = next.image as { width?: number; height?: number } | undefined;
        const width = image?.width ?? 1;
        const height = image?.height ?? 1;
        const aspect = width > 0 && height > 0 ? width / height : 1;
        next.wrapS = RepeatWrapping;
        next.wrapT = RepeatWrapping;
        next.repeat.set(repeat, repeat * aspect);
        next.colorSpace = SRGBColorSpace;
        next.minFilter = LinearMipmapLinearFilter;
        next.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        next.needsUpdate = true;
        setTexture(next);
        invalidate();
      },
      undefined,
      () => {
        if (active) {
          setTexture(null);
          invalidate();
        }
      },
    );

    return () => {
      active = false;
      loaded?.dispose();
    };
  }, [gl, invalidate, repeat, url]);

  return texture;
}
