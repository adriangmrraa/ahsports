import type { GarmentMeasurementSchema } from "@/db/schema";

export const GARMENT_FAMILIES = ["parte_superior", "campera", "pantalon", "short_futbol", "bermuda", "accesorio"] as const;
export const GARMENT_TYPES = ["remera", "chomba", "camiseta", "campera", "pantalon", "short", "bermuda", "conjunto", "accesorio"] as const;
export const GARMENT_TYPES_BY_FAMILY: Record<(typeof GARMENT_FAMILIES)[number], readonly (typeof GARMENT_TYPES)[number][]> = {
  parte_superior: ["remera", "chomba", "camiseta"],
  campera: ["campera"],
  pantalon: ["pantalon"],
  short_futbol: ["short"],
  bermuda: ["bermuda"],
  accesorio: ["accesorio"],
};
export const PRODUCT_KINDS = ["garment", "bundle"] as const;
export const BUNDLE_SIZE_MODES = ["same_label", "fixed"] as const;

const defaults: Record<(typeof GARMENT_FAMILIES)[number], GarmentMeasurementSchema> = {
  parte_superior: { required: ["ancho", "largo"], optional: ["manga", "hombros", "contorno_pecho", "cuello"] },
  campera: { required: ["ancho", "largo"], optional: ["manga", "hombros", "contorno_pecho", "puño"] },
  pantalon: { required: ["cintura", "largo"], optional: ["cadera", "tiro", "bota"] },
  short_futbol: { required: ["cintura", "largo"], optional: ["cadera", "tiro", "bota"] },
  bermuda: { required: ["cintura", "largo"], optional: ["cadera", "tiro", "bota"] },
  accesorio: { required: [], optional: [] },
};

export function defaultMeasurementSchema(family: (typeof GARMENT_FAMILIES)[number]): GarmentMeasurementSchema {
  return defaults[family];
}

export function validateGarmentMeasurementKeys(
  measurements: Record<string, number>,
  schema: GarmentMeasurementSchema,
) {
  const allowed = new Set([...schema.required, ...schema.optional]);
  const missing = schema.required.filter((key) => measurements[key] === undefined);
  const unknown = Object.keys(measurements).filter((key) => !allowed.has(key));
  return { missing, unknown };
}

export function labelGarmentFamily(family: string) {
  return {
    parte_superior: "Parte superior",
    campera: "Campera",
    pantalon: "Pantalón",
    short_futbol: "Short de fútbol",
    bermuda: "Bermuda",
    accesorio: "Accesorio",
  }[family] ?? family;
}

export function labelGarmentType(type: string) {
  return {
    remera: "Remera",
    chomba: "Chomba",
    camiseta: "Camiseta",
    campera: "Campera",
    pantalon: "Pantalón",
    short: "Short",
    bermuda: "Bermuda",
    conjunto: "Conjunto",
    accesorio: "Accesorio",
  }[type] ?? type;
}
