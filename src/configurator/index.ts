/**
 * Configurator module boundary — the only supported import surface for the
 * 3D garment renderer. Internal paths stay refactorable.
 *
 * Pure exports (model/registry/tokens/camera) are safe on server and client;
 * the viewer components are client-only ('use client' boundary inside).
 */

export {
  COLLAR_VARIANTS,
  DEFAULT_GARMENT_CONFIG,
  FABRIC_PRESET_IDS,
  GARMENT_ZONES,
  SLEEVE_VARIANTS,
  VIEW_PRESETS,
  isGarmentZone,
  isHexColor,
  normalizeGarmentConfig,
  type CollarVariant,
  type FabricPresetId,
  type GarmentColors,
  type GarmentConfig,
  type GarmentConfigInput,
  type GarmentZone,
  type HexColor,
  type ProductGarmentDescriptor,
  type SleeveVariant,
  type ViewPreset,
  type VisualAssetPlacement,
} from "./model";

export {
  FALLBACK_RENDERER_KEY,
  GARMENT_RENDERER_KEYS,
  resolveGarmentRenderer,
  type GarmentRendererKey,
  type RendererResolution,
} from "./registry";

export { FABRIC_PRESETS, fabricVisualPreset, SCENE_TOKENS, type FabricVisualPreset } from "./render-tokens";

export {
  cameraPoseToPosition,
  ORBIT_LIMITS,
  VIEW_CAMERA_PRESETS,
  VIEW_PRESET_LABELS,
  VIEW_TARGET,
  type CameraPose,
} from "./camera";

export { GARMENT_RENDERERS, ProductGarment, type ProductGarmentProps } from "./renderers";

export { GarmentViewer, type GarmentViewerHandle, type GarmentViewerProps } from "./viewer/GarmentViewer";

export {
  GarmentConfigurator,
  type ConfiguratorFabric,
  type ConfiguratorMode,
  type ConfiguratorProduct,
  type ConfiguratorState,
  type ConfiguratorUploader,
  type GarmentConfiguratorHandle,
  type GarmentConfiguratorProps,
} from "./ui/GarmentConfigurator";
export type { UploadedAsset } from "./ui/controls";

export {
  GARMENT_ZONE_LABELS,
  mapProductZoneLabel,
  productCapabilities,
  type ProductCapabilities,
} from "./capabilities";

export { JERSEY_DIMENSIONS } from "./geometry/jersey-geometry";
