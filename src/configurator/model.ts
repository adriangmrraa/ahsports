import { SCENE_TOKENS } from "./render-tokens";

/**
 * AH Sports 3D configurator — typed domain model.
 * Pure data + pure functions: no three.js, no React, no server imports.
 * Safe to consume from server components, client components and node tests.
 */

export type HexColor = `#${string}`;

export type GarmentColors = {
  /** Body and sleeves base color. */
  primary: HexColor;
  /** Shoulder yoke / structural panels. */
  secondary: HexColor;
  /** Collar trim and sleeve cuffs. */
  accent: HexColor;
};

export const COLLAR_VARIANTS = ["crew", "v-neck", "polo"] as const;
export type CollarVariant = (typeof COLLAR_VARIANTS)[number];

export const SLEEVE_VARIANTS = ["short", "long"] as const;
export type SleeveVariant = (typeof SLEEVE_VARIANTS)[number];

export const FABRIC_PRESET_IDS = ["performance", "satin", "pique", "mesh"] as const;
export type FabricPresetId = (typeof FABRIC_PRESET_IDS)[number];

export const VIEW_PRESETS = ["front", "back", "left", "right"] as const;
export type ViewPreset = (typeof VIEW_PRESETS)[number];

/**
 * Zones where a visual asset (logo, sponsor, number) may sit. They mirror the
 * catalog `zones` labels used by products ("Pecho izquierdo", "Manga derecha"…)
 * so placements map 1:1 to the product's allowed decoration areas.
 */
export const GARMENT_ZONES = [
  "chest-left",
  "chest-right",
  "front-center",
  "back-upper",
  "back-lower",
  "sleeve-left",
  "sleeve-right",
] as const;
export type GarmentZone = (typeof GARMENT_ZONES)[number];

/**
 * A future uploaded art asset pinned to a garment zone. `assetRef` will carry
 * the upload-session / attachment id once the upload pipeline lands; the
 * renderer stores placements now so decals/UV mapping slot in without a model
 * change.
 */
export type VisualAssetPlacement = {
  id: string;
  zone: GarmentZone;
  assetRef: string | null;
  /** Normalized 0..1 anchor for the future UV/decal mapping. */
  anchor: { u: number; v: number };
  scale: number;
  rotationDeg: number;
};

export type GarmentConfig = {
  colors: GarmentColors;
  /** Renderer fabric preset — drives PBR response. */
  fabric: FabricPresetId;
  /** Real catalog fabrics.id chosen by the user (null → renderer default). */
  fabricId: string | null;
  collar: CollarVariant;
  sleeves: SleeveVariant;
  view: ViewPreset;
  placements: readonly VisualAssetPlacement[];
};

/**
 * Product fields the renderer registry reasons about. Mirrors columns on the
 * `products` table (`garment_family`, `garment_type`, `product_type`,
 * `product_kind`) without importing server code — strings are matched
 * structurally so unknown/new catalog values degrade gracefully.
 */
export type ProductGarmentDescriptor = {
  garmentFamily?: string | null;
  garmentType?: string | null;
  productType?: string | null;
  productKind?: string | null;
};

/**
 * Unvalidated configurator input. Fields arrive as `unknown` because callers
 * forward raw state (partial picks, draft JSON, URL params) that has not been
 * checked yet — normalizeGarmentConfig validates field by field. `colors` is
 * a partial map of the three garment color keys so callers can override a
 * single channel; each value is still validated by pickColor.
 */
export type GarmentConfigInput = {
  colors?: Partial<Record<keyof GarmentColors, unknown>> | null;
  fabric?: unknown;
  fabricId?: unknown;
  collar?: unknown;
  sleeves?: unknown;
  view?: unknown;
  placements?: unknown;
};

export const DEFAULT_GARMENT_CONFIG: GarmentConfig = {
  colors: {
    primary: SCENE_TOKENS.garmentPrimary,
    secondary: SCENE_TOKENS.garmentSecondary,
    accent: SCENE_TOKENS.garmentAccent,
  },
  fabric: "performance",
  fabricId: null,
  collar: "crew",
  sleeves: "short",
  view: "front",
  placements: [],
};

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function isHexColor(value: unknown): value is HexColor {
  return typeof value === "string" && HEX_COLOR_RE.test(value);
}

export function isGarmentZone(value: unknown): value is GarmentZone {
  return typeof value === "string" && (GARMENT_ZONES as readonly string[]).includes(value);
}

function pickVariant<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function pickColor(value: unknown, fallback: HexColor): HexColor {
  return isHexColor(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizePlacement(value: unknown): VisualAssetPlacement | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || raw.id.length === 0 || !isGarmentZone(raw.zone)) return null;
  const anchor = typeof raw.anchor === "object" && raw.anchor !== null ? (raw.anchor as Record<string, unknown>) : {};
  return {
    id: raw.id,
    zone: raw.zone,
    assetRef: typeof raw.assetRef === "string" ? raw.assetRef : null,
    anchor: {
      u: clamp01(typeof anchor.u === "number" ? anchor.u : 0.5),
      v: clamp01(typeof anchor.v === "number" ? anchor.v : 0.5),
    },
    scale: typeof raw.scale === "number" && raw.scale > 0 ? raw.scale : 1,
    rotationDeg: typeof raw.rotationDeg === "number" ? raw.rotationDeg : 0,
  };
}

/**
 * Merge arbitrary input into a valid GarmentConfig. Unknown enum values fall
 * back to defaults, invalid colors are dropped, malformed placements are
 * filtered out — the renderer never has to defend itself.
 */
export function normalizeGarmentConfig(input?: GarmentConfigInput | null): GarmentConfig {
  const base = DEFAULT_GARMENT_CONFIG;
  if (!input) return { ...base, colors: { ...base.colors }, placements: [...base.placements] };
  const colors: Partial<Record<keyof GarmentColors, unknown>> = input.colors ?? {};
  const placements = Array.isArray(input.placements)
    ? input.placements.map(normalizePlacement).filter((p): p is VisualAssetPlacement => p !== null)
    : [];
  return {
    colors: {
      primary: pickColor(colors.primary, base.colors.primary),
      secondary: pickColor(colors.secondary, base.colors.secondary),
      accent: pickColor(colors.accent, base.colors.accent),
    },
    fabric: pickVariant(FABRIC_PRESET_IDS, input.fabric, base.fabric),
    fabricId: typeof input.fabricId === "string" && input.fabricId.length > 0 ? input.fabricId : null,
    collar: pickVariant(COLLAR_VARIANTS, input.collar, base.collar),
    sleeves: pickVariant(SLEEVE_VARIANTS, input.sleeves, base.sleeves),
    view: pickVariant(VIEW_PRESETS, input.view, base.view),
    placements,
  };
}
