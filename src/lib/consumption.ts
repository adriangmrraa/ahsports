export type ConsumptionMode = "direct" | "yield";

export type BomConsumptionInput = {
  mode: ConsumptionMode;
  directQuantity?: number | string | null;
  unitsPerConsumptionUnit?: number | string | null;
  /** Legacy BOM value used by rows created before the explicit fields existed. */
  legacyQuantity?: number | string | null;
  wastePercent: number | string;
  materialName?: string;
};

export type BomConsumption = {
  mode: ConsumptionMode;
  directQuantity: number | null;
  unitsPerConsumptionUnit: number | null;
  baseQuantityPerUnit: number;
  calculatedQuantityPerUnit: number;
  wastePercent: number;
};

function positive(value: number | string | null | undefined) {
  const parsed = value == null || value === "" ? NaN : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function label(materialName?: string) {
  return materialName ? ` del material "${materialName}"` : "";
}

/**
 * Calculates consumption before and after waste for one garment.
 * direct: base = directQuantity (or legacy quantity).
 * yield: base = 1 / unitsPerConsumptionUnit.
 */
export function calculateBomConsumption(input: BomConsumptionInput): BomConsumption {
  const wastePercent = Number(input.wastePercent);
  if (!Number.isFinite(wastePercent) || wastePercent < 0 || wastePercent > 100) {
    throw new Error(`La merma${label(input.materialName)} debe estar entre 0 y 100%.`);
  }

  if (input.mode === "direct") {
    const base = positive(input.directQuantity) ?? positive(input.legacyQuantity);
    if (base == null) {
      throw new Error(`Cargá una cantidad directa mayor a 0${label(input.materialName)}.`);
    }
    return {
      mode: "direct",
      directQuantity: base,
      unitsPerConsumptionUnit: null,
      baseQuantityPerUnit: base,
      calculatedQuantityPerUnit: base * (1 + wastePercent / 100),
      wastePercent,
    };
  }

  const units = positive(input.unitsPerConsumptionUnit);
  if (units == null) {
    throw new Error(`Cargá cuántas prendas rinde una unidad de consumo${label(input.materialName)}.`);
  }
  const base = 1 / units;
  return {
    mode: "yield",
    directQuantity: null,
    unitsPerConsumptionUnit: units,
    baseQuantityPerUnit: base,
    calculatedQuantityPerUnit: base * (1 + wastePercent / 100),
    wastePercent,
  };
}

export function consumptionUnit(unit: string) {
  // Existing kilo recipes are normalized to metres using metersPerKilo.
  return unit === "kilo" ? "metro" : unit;
}
