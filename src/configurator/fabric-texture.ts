import { DataTexture, LinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from "three";

/**
 * Small deterministic weave map shared by every material. It adds textile
 * micro-relief without another network request or a large mobile GPU asset.
 */
function createFabricWeaveTexture(): DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const thread = ((x % 4) < 2 ? 22 : -14) + ((y % 4) < 2 ? 18 : -10);
      const diagonal = ((x + y) % 8) < 4 ? 7 : -7;
      const value = Math.max(72, Math.min(184, 126 + thread + diagonal));
      const offset = (y * size + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(11, 11);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export const FABRIC_WEAVE_TEXTURE = createFabricWeaveTexture();
