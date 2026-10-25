import {
  COLLAR_VARIANTS,
  GARMENT_ZONES,
  type CollarVariant,
  type GarmentZone,
  type ProductGarmentDescriptor,
  type SleeveVariant,
  SLEEVE_VARIANTS,
} from "./model";
import { FALLBACK_RENDERER_KEY, resolveGarmentRenderer, type GarmentRendererKey } from "./registry";

/**
 * Per-product capability profile — which configurator controls make sense for
 * a given catalog row. Derived ONLY from structural fields (garmentType,
 * garmentFamily, productType, productKind); the catalog has no explicit
 * capability columns yet, so unknown values degrade to the safe jersey set.
 */

export type ColorRole = "primary" | "secondary" | "accent";

export type ProductCapabilities = {
  /** Renderer resolved by the structural registry (may be the honest fallback). */
  rendererKey: GarmentRendererKey;
  /** Why the registry picked that renderer — surfaced when it fell back. */
  rendererReason: string;
  collarVariants: readonly CollarVariant[];
  sleeveVariants: readonly SleeveVariant[];
  defaultCollar: CollarVariant;
  defaultSleeves: SleeveVariant;
  /** Which garment color channels the UI should expose. */
  colorRoles: readonly ColorRole[];
  /** Placement-capable zones for this product (catalog zones ∩ model zones). */
  zones: readonly GarmentZone[];
  /** Catalog zone labels that do not map onto a model zone — reference only. */
  unmappedZoneLabels: readonly string[];
  supportsPlacements: boolean;
  supportsFabrics: boolean;
};

const COLOR_ROLES_ALL: readonly ColorRole[] = ["primary", "secondary", "accent"];

/**
 * Catalog zone labels (Spanish, as stored in products.zones) → model zones.
 * Pure string mapping, no product-name branching. Unmapped labels (e.g.
 * "Pierna derecha" on bottoms) stay as reference-only decorations.
 */
const ZONE_LABEL_TO_GARMENT_ZONE: Readonly<Record<string, GarmentZone>> = {
  "pecho izquierdo": "chest-left",
  "pecho derecho": "chest-right",
  "pecho central": "front-center",
  "frente completo": "front-center",
  "espalda alta": "back-upper",
  "espalda central": "back-upper",
  "espalda baja": "back-lower",
  "manga izquierda": "sleeve-left",
  "manga derecha": "sleeve-right",
};

export function mapProductZoneLabel(label: string): GarmentZone | null {
  const mapped = ZONE_LABEL_TO_GARMENT_ZONE[label.trim().toLowerCase()];
  return mapped ?? null;
}

/** All model zones when the catalog row carries no zone list at all. */
const DEFAULT_ZONES: readonly GarmentZone[] = GARMENT_ZONES;

/**
 * Full-capability profile for the jersey family (camiseta/remera/chomba):
 * collar + sleeves + three color channels + placements on the mapped zones.
 */
function jerseyCapabilities(
  resolution: { key: GarmentRendererKey; reason: string },
  zones: readonly GarmentZone[],
  unmapped: readonly string[],
): ProductCapabilities {
  return {
    rendererKey: resolution.key,
    rendererReason: resolution.reason,
    collarVariants: COLLAR_VARIANTS,
    sleeveVariants: SLEEVE_VARIANTS,
    defaultCollar: "crew",
    defaultSleeves: "short",
    colorRoles: COLOR_ROLES_ALL,
    zones,
    unmappedZoneLabels: unmapped,
    supportsPlacements: resolution.key !== FALLBACK_RENDERER_KEY,
    supportsFabrics: true,
  };
}

export function productCapabilities(
  descriptor: ProductGarmentDescriptor | null | undefined,
  productZoneLabels?: readonly string[] | null,
): ProductCapabilities {
  const resolution = resolveGarmentRenderer(descriptor);
  const type = descriptor?.garmentType?.trim().toLowerCase() ?? "";
  const family = descriptor?.garmentFamily?.trim().toLowerCase() ?? "";
  const kind = descriptor?.productKind?.trim().toLowerCase() ?? "";

  // Map catalog zone labels → model zones, keeping order and dropping dupes.
  const mapped: GarmentZone[] = [];
  const unmapped: string[] = [];
  for (const label of productZoneLabels ?? []) {
    const zone = mapProductZoneLabel(label);
    if (zone) {
      if (!mapped.includes(zone)) mapped.push(zone);
    } else {
      unmapped.push(label);
    }
  }
  const zones = productZoneLabels && productZoneLabels.length > 0 ? mapped : DEFAULT_ZONES;

  // Accessories and bundles without a garment body get colors only — the
  // fallback renderer shows them honestly without fake garment controls.
  if (kind === "bundle" || type === "conjunto" || type === "accesorio" || family === "accesorio") {
    return {
      rendererKey: resolution.key,
      rendererReason: resolution.reason,
      collarVariants: [],
      sleeveVariants: [],
      defaultCollar: "crew",
      defaultSleeves: "short",
      colorRoles: COLOR_ROLES_ALL,
      zones,
      unmappedZoneLabels: unmapped,
      supportsPlacements: resolution.key !== FALLBACK_RENDERER_KEY,
      supportsFabrics: true,
    };
  }

  // Bottoms (pantalon/short/bermuda): no collar, no sleeves — honest profile
  // for the fallback renderer until a dedicated family renderer exists.
  if (type === "pantalon" || type === "short" || type === "bermuda" || family === "pantalon" || family === "short_futbol" || family === "bermuda") {
    return {
      rendererKey: resolution.key,
      rendererReason: resolution.reason,
      collarVariants: [],
      sleeveVariants: [],
      defaultCollar: "crew",
      defaultSleeves: "short",
      colorRoles: ["primary", "accent"],
      zones,
      unmappedZoneLabels: unmapped,
      supportsPlacements: false,
      supportsFabrics: true,
    };
  }

  // Jackets/hoodies (campera family): no collar control — those garments use
  // hood/zip structures; sleeves are fixed long.
  if (type === "campera" || family === "campera") {
    return {
      rendererKey: resolution.key,
      rendererReason: resolution.reason,
      collarVariants: [],
      sleeveVariants: ["long"],
      defaultCollar: "crew",
      defaultSleeves: "long",
      colorRoles: COLOR_ROLES_ALL,
      zones,
      unmappedZoneLabels: unmapped,
      supportsPlacements: resolution.key !== FALLBACK_RENDERER_KEY,
      supportsFabrics: true,
    };
  }

  return jerseyCapabilities(resolution, zones, unmapped);
}
