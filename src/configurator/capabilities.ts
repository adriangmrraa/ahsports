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
 * Pure string mapping, no product-name branching. Labels without a model
 * surface stay listed as reference-only information.
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
  "pierna izquierda": "leg-left",
  "pierna derecha": "leg-right",
};

export function mapProductZoneLabel(label: string): GarmentZone | null {
  const mapped = ZONE_LABEL_TO_GARMENT_ZONE[label.trim().toLowerCase()];
  return mapped ?? null;
}

/** Spanish display labels for model zones — summaries and placement lists. */
export const GARMENT_ZONE_LABELS: Readonly<Record<GarmentZone, string>> = {
  "chest-left": "Pecho izquierdo",
  "chest-right": "Pecho derecho",
  "front-center": "Frente central",
  "back-upper": "Espalda alta",
  "back-lower": "Espalda baja",
  "sleeve-left": "Manga izquierda",
  "sleeve-right": "Manga derecha",
  "leg-left": "Pierna izquierda",
  "leg-right": "Pierna derecha",
};

/** Zones on the upper body (torso, sleeves, back). */
const UPPER_ZONES: readonly GarmentZone[] = GARMENT_ZONES.filter(
  (z) => z !== "leg-left" && z !== "leg-right",
);
/** Zones on legs — only bottoms render them. */
const LOWER_ZONES: readonly GarmentZone[] = ["leg-left", "leg-right"];

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
  /** Catalog-declared zones when present; each family else gets its own defaults. */
  const explicitZones = productZoneLabels && productZoneLabels.length > 0 ? mapped : null;

  // Bundles (conjuntos): capabilities are the union of what the real
  // component garments can host — a camiseta+short set exposes torso and leg
  // zones, a campera+pantalón set keeps the hoodie fixed sleeve, etc.
  if (kind === "bundle" || type === "conjunto" || (descriptor?.components?.length ?? 0) > 0) {
    const componentKeys = (descriptor?.components ?? []).map(
      (component) => resolveGarmentRenderer(component).key,
    );
    const hasJersey = componentKeys.includes("sports-jersey");
    const hasUpper = hasJersey || componentKeys.includes("hoodie");
    const hasLower = componentKeys.includes("bottoms");
    const defaultZones: GarmentZone[] = [
      ...(hasUpper ? UPPER_ZONES : []),
      ...(hasLower ? LOWER_ZONES : []),
    ];
    return {
      rendererKey: resolution.key,
      rendererReason: resolution.reason,
      // Collar/sleeve controls only make sense when a component can take them.
      collarVariants: hasJersey ? COLLAR_VARIANTS : [],
      sleeveVariants: hasJersey ? SLEEVE_VARIANTS : componentKeys.includes("hoodie") ? ["long"] : [],
      defaultCollar: "crew",
      defaultSleeves: hasJersey ? "short" : "long",
      colorRoles: COLOR_ROLES_ALL,
      zones: explicitZones ?? defaultZones,
      unmappedZoneLabels: unmapped,
      supportsPlacements: hasUpper || hasLower,
      supportsFabrics: true,
    };
  }

  // Accessories get colors only — the fallback renderer shows them honestly
  // without fake garment controls or pretend decal zones.
  if (type === "accesorio" || family === "accesorio") {
    return {
      rendererKey: resolution.key,
      rendererReason: resolution.reason,
      collarVariants: [],
      sleeveVariants: [],
      defaultCollar: "crew",
      defaultSleeves: "short",
      colorRoles: COLOR_ROLES_ALL,
      zones: explicitZones ?? [],
      unmappedZoneLabels: unmapped,
      supportsPlacements: false,
      supportsFabrics: true,
    };
  }

  // Bottoms (pantalon/short/bermuda/calza): no collar, no sleeves — the legs
  // are the decal surface, so leg zones are real placement targets.
  if (resolution.key === "bottoms") {
    return {
      rendererKey: resolution.key,
      rendererReason: resolution.reason,
      collarVariants: [],
      sleeveVariants: [],
      defaultCollar: "crew",
      defaultSleeves: "short",
      colorRoles: ["primary", "accent"],
      zones: explicitZones ?? LOWER_ZONES,
      unmappedZoneLabels: unmapped,
      supportsPlacements: true,
      supportsFabrics: true,
    };
  }

  // Jackets/hoodies (campera family): no collar control — the hood is
  // structural; sleeves are fixed long.
  if (resolution.key === "hoodie") {
    return {
      rendererKey: resolution.key,
      rendererReason: resolution.reason,
      collarVariants: [],
      sleeveVariants: ["long"],
      defaultCollar: "crew",
      defaultSleeves: "long",
      colorRoles: COLOR_ROLES_ALL,
      zones: explicitZones ?? UPPER_ZONES,
      unmappedZoneLabels: unmapped,
      supportsPlacements: true,
      supportsFabrics: true,
    };
  }

  return jerseyCapabilities(resolution, explicitZones ?? UPPER_ZONES, unmapped);
}
