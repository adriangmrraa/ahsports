import { z } from "zod";
import { BUNDLE_SIZE_MODES, GARMENT_FAMILIES, GARMENT_TYPES, PRODUCT_KINDS } from "@/lib/garments";
import { validateProductTaxonomy } from "@/lib/product-taxonomy";

const productTaxonomyValue = z.string().trim().min(1).max(128);

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(255),
  phone: z.string().max(64).optional().nullable(),
  email: z.string().email("Email inválido").max(255).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  contactName: z.string().max(255).optional().nullable(),
  taxId: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const materialBaseSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().min(1).max(128),
  unit: z.enum(["metro", "kilo", "unidad", "centimetro", "mililitro", "metro_cuadrado", "rollo"]),
  unitPrice: z.number().min(0),
  supplier: z.string().optional().nullable(),
  supplierId: z.string().min(1).max(36).optional().nullable(),
  width: z.number().optional().nullable(),
  gramsPerMeter: z.number().optional().nullable(),
  metersPerKilo: z.number().optional().nullable(),
  yieldPercent: z.number().min(0).max(100).default(85),
  notes: z.string().optional().nullable(),
});

export const materialSchema = materialBaseSchema.refine(
  (d) => d.unit !== "kilo" || (d.metersPerKilo != null && d.metersPerKilo > 0),
  { message: "Si se compra por kilo, cargá cuántos metros rinde el kilo (el sistema convierte a $/metro)", path: ["metersPerKilo"] },
);

export const techniqueSchema = z.object({
  name: z.string().min(1).max(128),
  costPerUnit: z.number().min(0).default(0),
  costPerSquareMeter: z.number().min(0).default(0),
  setupCost: z.number().min(0).default(0),
  description: z.string().optional().nullable(),
});

export const pricingRuleSchema = z.object({
  name: z.string().min(1).max(128),
  marginPercent: z.number().min(0).max(500).default(40),
  urgentSurcharge: z.number().min(0).max(100).default(15),
  minAdvancePercent: z.number().min(0).max(100).default(50),
  rounding: z.number().int().min(1).default(100),
  active: z.boolean().default(false),
});

export const bundleComponentSchema = z.object({
  componentProductId: z.string().min(1).max(36),
  quantity: z.number().finite().positive().max(1000).default(1),
  sizeMode: z.enum(BUNDLE_SIZE_MODES).default("same_label"),
  componentSizeId: z.string().min(1).max(36).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.sizeMode === "fixed" && !value.componentSizeId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["componentSizeId"], message: "Elegí el talle fijo del componente." });
  }
  if (value.sizeMode === "same_label" && value.componentSizeId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["componentSizeId"], message: "El modo mismo talle no usa un talle fijo." });
  }
});

const productBaseSchema = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  productKind: z.enum(PRODUCT_KINDS).default("garment"),
  productCategory: productTaxonomyValue.default("indumentaria"),
  productSubcategory: productTaxonomyValue.default("prendas"),
  productType: productTaxonomyValue.default("otro"),
  garmentFamily: z.enum(GARMENT_FAMILIES).nullable().default("parte_superior"),
  garmentType: z.enum(GARMENT_TYPES).nullable().default("remera"),
  moldId: z.string().min(1).max(36).optional().nullable(),
  bundleItems: z.array(bundleComponentSchema).max(32).default([]),
  // Legado: el precio de venta lo calcula la receta + margen (quoteOrder).
  // Se conserva como referencia / override manual por línea.
  basePrice: z.number().min(0).default(0),
  minOrder: z.number().int().min(1).default(1),
  zones: z.array(z.string()).default([]),
});

export const productSchema = productBaseSchema.superRefine((value, ctx) => {
  const taxonomyError = validateProductTaxonomy(value.productCategory, value.productSubcategory, value.productType);
  if (taxonomyError) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["productSubcategory"], message: taxonomyError });
  if (value.productKind === "bundle" && value.garmentType !== null && value.garmentType !== "conjunto") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["garmentType"], message: "Un producto compuesto debe ser de tipo conjunto." });
  }
  if (value.productKind === "garment" && value.garmentType === "conjunto") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["productKind"], message: "El tipo conjunto requiere producto compuesto." });
  }
  const familyByType: Record<string, string> = {
    remera: "parte_superior",
    chomba: "parte_superior",
    camiseta: "parte_superior",
    campera: "campera",
    pantalon: "pantalon",
    short: "short_futbol",
    bermuda: "bermuda",
    accesorio: "accesorio",
  };
  const expectedFamily = value.garmentType ? familyByType[value.garmentType] : undefined;
  if (expectedFamily && expectedFamily !== value.garmentFamily) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["garmentFamily"], message: `El tipo ${value.garmentType} requiere la familia ${expectedFamily}.` });
  }
});
export const productPatchSchema = productBaseSchema.partial();

const garmentMoldBaseSchema = z.object({
  name: z.string().trim().min(1).max(128),
  family: z.enum(GARMENT_FAMILIES),
  requiredMeasurements: z.array(z.string().trim().min(1).max(64)).max(32).default([]),
  optionalMeasurements: z.array(z.string().trim().min(1).max(64)).max(32).default([]),
  notes: z.string().max(2000).optional().nullable(),
});

export const garmentMoldSchema = garmentMoldBaseSchema.superRefine((value, ctx) => {
  const all = [...value.requiredMeasurements, ...value.optionalMeasurements];
  if (new Set(all).size !== all.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["optionalMeasurements"], message: "No repitas nombres de medidas entre requeridas y opcionales." });
  }
});
export const garmentMoldPatchSchema = garmentMoldBaseSchema.partial();

export const sizesBatchSchema = z.object({
  sizes: z.array(z.object({
    id: z.string().optional(),
    label: z.string().min(1).max(32),
    order: z.number().int().min(0),
    measurements: z.record(z.string().trim().min(1).max(64), z.number().finite().nonnegative()),
  })),
}).superRefine((value, ctx) => {
  const ids = value.sizes.map((size) => size.id).filter((id): id is string => Boolean(id));
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sizes"], message: "Un talle no puede repetirse" });
  }
});

export const recipeSchema = z.object({
  productId: z.string().min(1).max(36),
  sizeId: z.string().max(36).optional().nullable(),
  techniqueId: z.string().max(36).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const recipeItemSchema = z.object({
  materialId: z.string().min(1).max(36),
  /** Legacy direct quantity accepted so old clients and imports remain valid. */
  quantity: z.number().finite().positive().optional(),
  consumptionMode: z.enum(["direct", "yield"]).default("direct"),
  directQuantity: z.number().finite().positive().optional().nullable(),
  unitsPerConsumptionUnit: z.number().finite().positive().optional().nullable(),
  wastePercent: z.number().min(0).max(100).default(0),
}).strict().superRefine((value, ctx) => {
  if (value.consumptionMode === "direct" && value.directQuantity == null && value.quantity == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["directQuantity"], message: "Cargá la cantidad por prenda." });
  }
  if (value.consumptionMode === "yield" && value.unitsPerConsumptionUnit == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unitsPerConsumptionUnit"], message: "Cargá cuántas prendas rinde una unidad de consumo." });
  }
  if (value.consumptionMode === "direct" && value.unitsPerConsumptionUnit != null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unitsPerConsumptionUnit"], message: "El modo directo no usa rendimiento." });
  }
  if (value.consumptionMode === "yield" && value.directQuantity != null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["directQuantity"], message: "El modo rendimiento no usa cantidad directa." });
  }
});

export const organizationKindSchema = z.enum(["club", "empresa", "colegio", "institucion", "particular"]);

export const organizationSchema = z.object({
  name: z.string().min(1).max(255),
  kind: organizationKindSchema,
  taxId: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const contactSchema = z.object({
  organizationId: z.string().min(1).max(36).optional().nullable(),
  name: z.string().min(1).max(255),
  email: z.string().email("Email inválido").max(255).optional().nullable(),
  phone: z.string().max(64).optional().nullable(),
  role: z.string().max(128).optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["nuevo", "contactado", "calificado", "convertido", "perdido"]).default("nuevo"),
});

export const organizationWithContactSchema = z.object({
  organization: organizationSchema,
  contact: contactSchema.omit({ organizationId: true, status: true }).extend({
    status: z.enum(["nuevo", "contactado", "calificado", "convertido", "perdido"]).default("nuevo").optional(),
  }),
});

export const orderStatusSchema = z.enum([
  "borrador",
  "presupuesto_enviado",
  "aprobado",
  "seniado",
  "en_produccion",
  "corte",
  "confeccion",
  "estampado",
  "control",
  "entregado",
  "cancelado",
  "bloqueado_pago",
]);

export const orderSchema = z.object({
  organizationId: z.string().min(1).max(36).optional().nullable(),
  contactId: z.string().min(1).max(36).optional().nullable(),
  status: orderStatusSchema.default("borrador"),
  urgent: z.boolean().default(false),
  notes: z.string().min(1, "Notas requeridas"),
  internalNotes: z.string().optional().nullable(),
  pricingRuleId: z.string().min(1).max(36).optional().nullable(),
});

export const orderLineSchema = z.object({
  orderId: z.string().min(1).max(36),
  productId: z.string().min(1).max(36),
  techniqueId: z.string().max(36).optional().nullable(),
  recipeId: z.string().max(36).optional().nullable(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0).default(0),
  unitCost: z.number().min(0).default(0),
  notes: z.string().optional().nullable(),
});

export const createOrderLineSchema = z.object({
  orderId: z.string().min(1).max(36),
  productId: z.string().min(1).max(36),
  techniqueId: z.string().max(36).optional().nullable(),
  notes: z.string().optional().nullable(),
  sizeQuantities: z.record(z.string(), z.number().int().min(0).max(1000)).default({}),
  quantity: z.number().int().min(1).max(10000).optional().nullable(),
}).strict().refine(
  (d) => Object.values(d.sizeQuantities ?? {}).some((q) => q > 0) || (d.quantity ?? 0) > 0,
  { message: "Indicá cantidad total o cantidad por talle", path: ["quantity"] },
);

export const orderItemPatchSchema = z.object({
  individualName: z.string().max(128).optional().nullable(),
  individualNumber: z.string().max(32).optional().nullable(),
  status: z.enum(["ingreso", "corte", "confeccion", "estampado", "control", "entrega"]).optional(),
}).strict().refine(
  (d) => d.individualName !== undefined || d.individualNumber !== undefined || d.status !== undefined,
  { message: "Sin cambios" },
);

export const orderItemStageSchema = z.object({
  stage: z.enum(["ingreso", "corte", "confeccion", "estampado", "control", "entrega"]),
}).strict();

export const stageSchema = z.object({
  stage: z.enum(["en_produccion", "corte", "confeccion", "estampado", "control", "entregado"]),
});

export const confirmQuoteSchema = z.object({
  orderId: z.string().min(1).max(36),
  pricingRuleId: z.string().min(1).max(36).optional().nullable(),
});

export const reQuoteOrderSchema = z.object({
  orderId: z.string().min(1).max(36),
  urgent: z.boolean().default(false),
}).strict();

export const attachmentKindSchema = z.enum([
  "identidad_organizacion",
  "sponsor",
  "diseno_pedido",
  "personalizacion_individual",
  "documento_operativo",
  "produccion_calidad",
]);

export const attachmentStatusSchema = z.enum([
  "pendiente_revision",
  "aprobado",
  "requiere_reemplazo",
  "rechazado",
  "archivado",
]);

export const applicationViewSchema = z.enum(["frente", "espalda", "lateral", "manga", "otro"]);

export const paymentKindSchema = z.enum(["sena", "pago", "saldo"]);
export const paymentMethodSchema = z.enum(["efectivo", "transferencia", "cheque", "mercadopago", "otro"]);

/** F5-04 — Alta de pago. El recálculo de bloqueo lo hace el servicio. */
export const registerPaymentSchema = z.object({
  orderId: z.string().min(1).max(36),
  kind: paymentKindSchema,
  method: paymentMethodSchema,
  amount: z.number().finite().positive().max(999999999999),
  reference: z.string().trim().max(128).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
}).strict();

/** F5-06 — Cancelación (soft-delete) de un pago. */
export const cancelPaymentSchema = z.object({
  paymentId: z.string().min(1).max(36),
}).strict();

/** Upload multipart: kind + al menos uno de orderId / organizationId. */
export const attachmentUploadSchema = z
  .object({
    kind: attachmentKindSchema,
    orderId: z.string().min(1).max(36).optional().nullable(),
    organizationId: z.string().min(1).max(36).optional().nullable(),
    name: z.string().min(1).max(255).optional().nullable(),
  })
  .refine((d) => d.orderId || d.organizationId, {
    message: "orderId u organizationId requerido",
    path: ["orderId"],
  });

export const attachmentPatchSchema = z
  .object({
    status: attachmentStatusSchema.optional(),
    notes: z.string().max(2000).optional().nullable(),
    name: z.string().min(1).max(255).optional(),
  })
  .strict()
  .refine((d) => d.status !== undefined || d.notes !== undefined || d.name !== undefined, {
    message: "Sin cambios",
  });

export const applicationSchema = z.object({
  attachmentId: z.string().min(1).max(36),
  orderLineId: z.string().min(1).max(36).optional().nullable(),
  zone: z.string().min(1).max(64),
  view: applicationViewSchema.default("frente"),
  techniqueId: z.string().min(1).max(36).optional().nullable(),
  widthCm: z.number().positive().max(500).optional().nullable(),
  heightCm: z.number().positive().max(500).optional().nullable(),
  quantity: z.number().int().min(1).default(1),
  instructions: z.string().max(2000).optional().nullable(),
});

/** POST /api/attachments/[id]/applications: attachmentId va en la URL. */
export const applicationInputSchema = applicationSchema.omit({ attachmentId: true });

export const copyAttachmentSchema = z.object({
  attachmentId: z.string().min(1).max(36),
  orderId: z.string().min(1).max(36),
});

/** Public wizard payload. Totals, labels and pricing are derived from the DB. */
export const createPublicOrderSchema = z.object({
  type: z.enum(["new", "returning"]),
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email("Email inválido").max(255),
  phone: z.string().trim().min(3).max(64),
  organizationName: z.string().trim().min(1).max(255).optional(),
  notes: z.string().trim().max(4000).optional(),
  productId: z.string().uuid(),
  sizeQuantities: z.array(z.object({
    sizeId: z.string().uuid().nullable(),
    quantity: z.number().int().min(1).max(1000),
  })).min(1).max(32),
  items: z.array(z.object({
    sizeId: z.string().uuid().nullable(),
    individualName: z.string().trim().max(128).optional().nullable(),
    individualNumber: z.string().trim().max(32).optional().nullable(),
  })).min(1).max(1000),
  fileIds: z.array(z.string().uuid()).max(20).default([]),
  uploadSessionId: z.string().uuid(),
  uploadSessionSecret: z.string().min(32).max(128),
}).strict().superRefine((value, ctx) => {
  const seenSizes = new Set<string | null>();
  for (const size of value.sizeQuantities) {
    if (seenSizes.has(size.sizeId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sizeQuantities"], message: "Un talle solo puede enviarse una vez" });
    seenSizes.add(size.sizeId);
  }
  if (new Set(value.fileIds).size !== value.fileIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fileIds"], message: "Un archivo no puede repetirse" });
  }
});

/** Public pre-order upload metadata. The file itself is validated separately. */
export const publicAttachmentUploadSchema = z.object({
  kind: attachmentKindSchema,
  uploadSessionId: z.string().uuid(),
  uploadSessionSecret: z.string().min(32).max(128),
}).strict();

export function isUniqueViolation(e: unknown) {
  // Drizzle envuelve el error del driver en `cause` (NeonDbError, code 23505).
  // Se recorre la cadena porque el mensaje externo solo trae la query.
  let cur: unknown = e;
  for (let depth = 0; cur && depth < 5; depth++) {
    const er = cur as { message?: unknown; code?: unknown; cause?: unknown };
    const code = typeof er.code === "string" || typeof er.code === "number" ? String(er.code) : "";
    if (code === "23505") return true;
    const msg = typeof er.message === "string" ? er.message : String(er.message ?? "");
    if (/unique|duplicate/i.test(msg)) return true;
    cur = er.cause;
  }
  return false;
}
