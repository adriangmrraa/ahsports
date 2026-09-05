import { z } from "zod";

export const materialSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().min(1).max(128),
  unit: z.enum(["metro", "kilo", "unidad", "centimetro", "mililitro", "metro_cuadrado", "rollo"]),
  unitPrice: z.number().min(0),
  supplier: z.string().optional().nullable(),
  width: z.number().optional().nullable(),
  gramsPerMeter: z.number().optional().nullable(),
  metersPerKilo: z.number().optional().nullable(),
  yieldPercent: z.number().min(0).max(100).default(85),
  notes: z.string().optional().nullable(),
});

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

export const productSchema = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  basePrice: z.number().min(0),
  minOrder: z.number().int().min(1).default(1),
  zones: z.array(z.string()).default([]),
});

export const sizesBatchSchema = z.object({
  sizes: z.array(z.object({
    id: z.string().optional(),
    label: z.string().min(1).max(32),
    order: z.number().int().min(0),
    measurements: z.record(z.string(), z.number()),
  })),
});

export const recipeSchema = z.object({
  productId: z.string().min(1).max(36),
  sizeId: z.string().max(36).optional().nullable(),
  techniqueId: z.string().max(36).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const recipeItemSchema = z.object({
  materialId: z.string().min(1).max(36),
  quantity: z.number().positive(),
  wastePercent: z.number().min(0).max(100).default(0),
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
    sizeId: z.string().uuid(),
    quantity: z.number().int().min(1).max(1000),
  })).min(1).max(32),
  items: z.array(z.object({
    sizeId: z.string().uuid(),
    individualName: z.string().trim().max(128).optional().nullable(),
    individualNumber: z.string().trim().max(32).optional().nullable(),
  })).min(1).max(1000),
  fileIds: z.array(z.string().uuid()).max(20).default([]),
  uploadSessionId: z.string().uuid(),
  uploadSessionSecret: z.string().min(32).max(128),
}).strict().superRefine((value, ctx) => {
  const seenSizes = new Set<string>();
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
