import { useEffect, useMemo } from "react";
import { BoxGeometry, TorusGeometry, type BufferGeometry } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { fabricVisualPreset } from "../render-tokens";
import type { GarmentModelProps } from "./SportsJersey";
import { FABRIC_WEAVE_TEXTURE } from "../fabric-texture";
import { useSublimationTexture } from "../sublimation-texture";

type AccessoryGeometries = {
  body: BufferGeometry;
  front: BufferGeometry;
  handle: BufferGeometry;
  zip: BufferGeometry;
  sideLeft: BufferGeometry;
  sideRight: BufferGeometry;
};

/** Dedicated bag/backpack preview for catalog accessories. */
export function AccessoryGarment({ config, descriptor, assetUrls }: GarmentModelProps) {
  const isBackpack = `${descriptor?.productType ?? ""} ${descriptor?.garmentFamily ?? ""}`.toLowerCase().includes("mochila");
  const geometries = useMemo<AccessoryGeometries>(() => {
    const width = isBackpack ? 0.88 : 1.24;
    const height = isBackpack ? 1.14 : 0.72;
    const depth = isBackpack ? 0.42 : 0.52;
    const centerY = isBackpack ? 0.78 : 0.72;
    const body = new RoundedBoxGeometry(width, height, depth, 6, 0.09);
    body.translate(0, centerY, 0);
    const front = new RoundedBoxGeometry(width * 0.76, height * 0.34, 0.07, 4, 0.035);
    front.translate(0, centerY - height * 0.2, depth / 2 + 0.025);
    const handle = new TorusGeometry(isBackpack ? 0.2 : 0.31, 0.035, 10, 32);
    handle.translate(0, centerY + height / 2 + (isBackpack ? 0.02 : 0.04), 0);
    const zip = new BoxGeometry(width * 0.64, 0.025, 0.035);
    zip.translate(0, centerY + height * 0.18, depth / 2 + 0.055);
    const sideLeft = new RoundedBoxGeometry(0.065, height * 0.7, depth * 0.7, 3, 0.02);
    sideLeft.translate(-width / 2 - 0.018, centerY, 0);
    const sideRight = sideLeft.clone();
    sideRight.translate(width + 0.036, 0, 0);
    return { body, front, handle, zip, sideLeft, sideRight };
  }, [isBackpack]);

  useEffect(() => () => {
    Object.values(geometries).forEach((geometry) => geometry.dispose());
  }, [geometries]);

  const fabric = fabricVisualPreset(config.fabric);
  const pattern = useSublimationTexture(
    config.sublimation ? (assetUrls?.[config.sublimation.assetRef] ?? null) : null,
    config.sublimation?.repeat ?? 2,
  );
  const material = {
    roughness: fabric.roughness,
    sheen: fabric.sheen,
    sheenRoughness: fabric.sheenRoughness,
    envMapIntensity: fabric.envMapIntensity,
    bumpMap: FABRIC_WEAVE_TEXTURE,
    bumpScale: 0.016,
    roughnessMap: FABRIC_WEAVE_TEXTURE,
  };

  return (
    <group name={isBackpack ? "accessory-backpack" : "accessory-bag"}>
      <mesh castShadow geometry={geometries.body}>
        <meshPhysicalMaterial color={pattern ? "#ffffff" : config.colors.primary} map={pattern ?? undefined} {...material} />
      </mesh>
      <mesh castShadow geometry={geometries.front}>
        <meshPhysicalMaterial color={pattern ? "#ffffff" : config.colors.secondary} map={pattern ?? undefined} {...material} />
      </mesh>
      <mesh geometry={geometries.handle}>
        <meshPhysicalMaterial color={config.colors.accent} roughness={0.55} />
      </mesh>
      <mesh geometry={geometries.zip}>
        <meshPhysicalMaterial color={config.colors.accent} roughness={0.4} metalness={0.18} />
      </mesh>
      <mesh geometry={geometries.sideLeft}>
        <meshPhysicalMaterial color={pattern ? "#ffffff" : config.colors.secondary} map={pattern ?? undefined} {...material} />
      </mesh>
      <mesh geometry={geometries.sideRight}>
        <meshPhysicalMaterial color={pattern ? "#ffffff" : config.colors.secondary} map={pattern ?? undefined} {...material} />
      </mesh>
    </group>
  );
}
