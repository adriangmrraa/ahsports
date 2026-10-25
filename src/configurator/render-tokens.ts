import type { FabricPresetId, HexColor } from "./model";

/**
 * Centralized render-space tokens for the 3D configurator.
 * Values mirror the semantic `@theme` palette in `src/app/globals.css`
 * (navy scale + amber accent). Scene JSX must consume these constants —
 * never scatter hex literals through the renderer components.
 */
export const SCENE_TOKENS = {
  /** Premium navy studio backdrop (color-navy-950). */
  backdrop: "#081226" as HexColor,
  /** Fog blends geometry edges into the backdrop (color-navy-900). */
  backdropFog: "#0f1f3a" as HexColor,
  /** Stage floor disc (color-navy-900). */
  floor: "#0f1f3a" as HexColor,
  /** Thin ring that reads the stage edge (color-navy-700). */
  floorRing: "#1b3763" as HexColor,
  /** Cool-white key light. */
  keyLight: "#f5f7ff" as HexColor,
  /** Navy-tinted fill so shadows stay blue, not gray (color-navy-300). */
  fillLight: "#84a1cf" as HexColor,
  /** Warm amber rim for the premium edge highlight (color-accent). */
  rimLight: "#f5a524" as HexColor,
  /** Neutral garment defaults pulled from the brand palette. */
  garmentPrimary: "#152a4d" as HexColor,
  garmentSecondary: "#0f1f3a" as HexColor,
  garmentAccent: "#f5a524" as HexColor,
  /** Muted tone for the fallback garment so it never masquerades as a product. */
  fallbackGarment: "#45577a" as HexColor,
} as const;

/**
 * Visual response of a fabric preset, mapped to MeshPhysicalMaterial params.
 * Geometry stays identical across presets — only the PBR response changes.
 * `sheen` carries the cloth look; `clearcoat` fakes the sublimation finish.
 */
export type FabricVisualPreset = {
  label: string;
  roughness: number;
  sheen: number;
  sheenRoughness: number;
  /** Sheen tint — a touch of warm white keeps highlights cloth-like. */
  sheenColor: HexColor;
  clearcoat: number;
  clearcoatRoughness: number;
  envMapIntensity: number;
};

export const FABRIC_PRESETS: Record<FabricPresetId, FabricVisualPreset> = {
  performance: {
    label: "Deportiva",
    roughness: 0.55,
    sheen: 0.45,
    sheenRoughness: 0.55,
    sheenColor: "#e8eefb" as HexColor,
    clearcoat: 0.1,
    clearcoatRoughness: 0.6,
    envMapIntensity: 0.9,
  },
  satin: {
    label: "Sublimada satinada",
    roughness: 0.34,
    sheen: 0.7,
    sheenRoughness: 0.4,
    sheenColor: "#fdf6ea" as HexColor,
    clearcoat: 0.3,
    clearcoatRoughness: 0.45,
    envMapIntensity: 1.1,
  },
  pique: {
    label: "Piqué",
    roughness: 0.82,
    sheen: 0.18,
    sheenRoughness: 0.75,
    sheenColor: "#e8eefb" as HexColor,
    clearcoat: 0,
    clearcoatRoughness: 0.8,
    envMapIntensity: 0.55,
  },
  mesh: {
    label: "Mesh respirable",
    roughness: 0.9,
    sheen: 0.08,
    sheenRoughness: 0.85,
    sheenColor: "#e8eefb" as HexColor,
    clearcoat: 0,
    clearcoatRoughness: 0.9,
    envMapIntensity: 0.45,
  },
};

export function fabricVisualPreset(id: FabricPresetId | string | null | undefined): FabricVisualPreset {
  if (id && id in FABRIC_PRESETS) return FABRIC_PRESETS[id as FabricPresetId];
  return FABRIC_PRESETS.performance;
}
