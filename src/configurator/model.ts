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

export const SLEEVE_VARIANTS = ["sleeveless", "short", "long"] as const;
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
  "leg-left",
  "leg-right",
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
  /**
   * Bundle component product id hosting this decal. Absent → the decal
   * targets whichever scope-matching garment the raycast hits first
   * (single products and legacy configs behave exactly like before).
   */
  componentId?: string;
  /** Normalized 0..1 anchor for the future UV/decal mapping. */
  anchor: { u: number; v: number };
  scale: number;
  rotationDeg: number;
};

/** Which surface class each zone lives on — legs only exist on bottoms. */
export const ZONE_SCOPE: Record<GarmentZone, "upper" | "lower"> = {
  "front-center": "upper",
  "chest-left": "upper",
  "chest-right": "upper",
  "back-upper": "upper",
  "back-lower": "upper",
  "sleeve-left": "upper",
  "sleeve-right": "upper",
  "leg-left": "lower",
  "leg-right": "lower",
};

/**
 * Full-garment artwork used as the sublimated base layer. It is deliberately
 * separate from placements: logos and sponsors remain independent decals
 * rendered above this repeated textile pattern.
 */
export type SublimationPattern = {
  assetRef: string;
  /** Number of horizontal repeats across the garment UV space. */
  repeat: number;
};

/**
 * Per-component appearance inside a bundle (conjunto). Only the fields the
 * user can meaningfully vary per garment — placements stay in the shared
 * top-level array and pin their host via `componentId`.
 */
export type GarmentComponentOverride = {
  colors?: Partial<GarmentColors>;
  fabric?: FabricPresetId;
  fabricId?: string | null;
  collar?: CollarVariant;
  sleeves?: SleeveVariant;
  sublimation?: SublimationPattern | null;
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
  sublimation: SublimationPattern | null;
  placements: readonly VisualAssetPlacement[];
  /** Bundle component overrides keyed by component product id. */
  componentOverrides?: Record<string, GarmentComponentOverride>;
};

/**
 * Product fields the renderer registry reasons about. Mirrors columns on the
 * `products` table (`garment_family`, `garment_type`, `product_type`,
 * `product_kind`) without importing server code — strings are matched
 * structurally so unknown/new catalog values degrade gracefully.
 */
export type ProductGarmentDescriptor = {
  /** Component product id — present on bundle components and catalog picks. */
  id?: string;
  /** Display name — bundle components carry the real product name for tabs. */
  name?: string | null;
  garmentFamily?: string | null;
  garmentType?: string | null;
  productType?: string | null;
  productKind?: string | null;
  /**
   * Bundle composition (conjuntos): descriptors of the real component
   * products resolved from product_bundle_items. The bundle renderer draws
   * each component's own garment instead of duplicating geometry.
   */
  components?: readonly ProductGarmentDescriptor[];
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
  sublimation?: unknown;
  placements?: unknown;
  componentOverrides?: unknown;
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
  sublimation: null,
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
    componentId:
      typeof raw.componentId === "string" && raw.componentId.length > 0
        ? raw.componentId
        : undefined,
    anchor: {
      u: clamp01(typeof anchor.u === "number" ? anchor.u : 0.5),
      v: clamp01(typeof anchor.v === "number" ? anchor.v : 0.5),
    },
    scale: typeof raw.scale === "number" && raw.scale > 0 ? raw.scale : 1,
    rotationDeg: typeof raw.rotationDeg === "number" ? raw.rotationDeg : 0,
  };
}

function normalizeSublimation(value: unknown): SublimationPattern | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.assetRef !== "string" || raw.assetRef.length === 0) return null;
  const repeat = typeof raw.repeat === "number" && Number.isFinite(raw.repeat) ? raw.repeat : 2;
  return {
    assetRef: raw.assetRef,
    repeat: Math.min(12, Math.max(1, repeat)),
  };
}

/**
 * Merge arbitrary input into a valid GarmentConfig. Unknown enum values fall
 * back to defaults, invalid colors are dropped, malformed placements are
 * filtered out — the renderer never has to defend itself.
 */
function normalizeComponentOverrides(
  value: unknown,
): Record<string, GarmentComponentOverride> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const out: Record<string, GarmentComponentOverride> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null || key.length === 0) continue;
    const raw = entry as Record<string, unknown>;
    const colors: Partial<GarmentColors> = {};
    if (typeof raw.colors === "object" && raw.colors !== null) {
      const rc = raw.colors as Record<string, unknown>;
      for (const role of ["primary", "secondary", "accent"] as const) {
        if (isHexColor(rc[role])) colors[role] = rc[role] as HexColor;
      }
    }
    const override: GarmentComponentOverride = {};
    if (Object.keys(colors).length > 0) override.colors = colors;
    if ((FABRIC_PRESET_IDS as readonly string[]).includes(raw.fabric as string)) {
      override.fabric = raw.fabric as FabricPresetId;
    }
    if (raw.fabricId === null || (typeof raw.fabricId === "string" && raw.fabricId.length > 0)) {
      override.fabricId = raw.fabricId as string | null;
    }
    if ((COLLAR_VARIANTS as readonly string[]).includes(raw.collar as string)) {
      override.collar = raw.collar as CollarVariant;
    }
    if ((SLEEVE_VARIANTS as readonly string[]).includes(raw.sleeves as string)) {
      override.sleeves = raw.sleeves as SleeveVariant;
    }
    if (raw.sublimation === null) override.sublimation = null;
    else {
      const sub = normalizeSublimation(raw.sublimation);
      if (sub) override.sublimation = sub;
    }
    if (Object.keys(override).length > 0) out[key] = override;
  }
  return Object.keys(out).length > 0 ? out : undefined;
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
  const componentOverrides = normalizeComponentOverrides(input.componentOverrides);
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
    sublimation: normalizeSublimation(input.sublimation),
    placements,
    ...(componentOverrides ? { componentOverrides } : {}),
  };
}

/**
 * Effective config for one bundle component: base config plus the
 * component's own overrides. Single products pass through untouched.
 */
export function resolveComponentConfig(
  config: GarmentConfig,
  componentId?: string | null,
): GarmentConfig {
  const override = componentId ? config.componentOverrides?.[componentId] : undefined;
  if (!override) return config;
  return {
    ...config,
    colors: { ...config.colors, ...(override.colors ?? {}) },
    fabric: override.fabric ?? config.fabric,
    fabricId: override.fabricId !== undefined ? override.fabricId : config.fabricId,
    collar: override.collar ?? config.collar,
    sleeves: override.sleeves ?? config.sleeves,
    sublimation:
      override.sublimation !== undefined ? override.sublimation : config.sublimation,
  };
}

/** Every uploaded asset referenced by a design, deduplicated for DB lookups. */
export function garmentAssetRefs(config: GarmentConfig): string[] {
  const refs = config.placements
    .map((placement) => placement.assetRef)
    .filter((ref): ref is string => Boolean(ref));
  if (config.sublimation?.assetRef) refs.push(config.sublimation.assetRef);
  for (const override of Object.values(config.componentOverrides ?? {})) {
    if (override.sublimation?.assetRef) refs.push(override.sublimation.assetRef);
  }
  return [...new Set(refs)];
}
