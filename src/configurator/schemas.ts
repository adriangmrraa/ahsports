import { z } from "zod";
import {
  COLLAR_VARIANTS,
  FABRIC_PRESET_IDS,
  GARMENT_ZONES,
  SLEEVE_VARIANTS,
  VIEW_PRESETS,
} from "./model";

/**
 * Strict boundary schemas for configurator data at the server edge (API
 * actions, draft payload persistence). Unlike `normalizeGarmentConfig` —
 * which repairs unknown input for the renderer — these REJECT bad data so
 * stored rows are always well-formed.
 */

export const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Color hex inválido");

export const garmentColorsSchema = z.object({
  primary: hexColorSchema,
  secondary: hexColorSchema,
  accent: hexColorSchema,
});

export const visualAssetPlacementSchema = z.object({
  id: z.string().min(1).max(128),
  zone: z.enum(GARMENT_ZONES),
  /** Staged attachment id (upload_sessions pipeline) once the file exists. */
  assetRef: z.string().min(1).max(64).nullable(),
  anchor: z.object({
    u: z.number().min(0).max(1),
    v: z.number().min(0).max(1),
  }),
  scale: z.number().positive().max(10),
  rotationDeg: z.number().min(-360).max(360),
});

export const garmentConfigSchema = z.object({
  colors: garmentColorsSchema,
  fabric: z.enum(FABRIC_PRESET_IDS),
  /** Real catalog fabrics.id — separate from the renderer preset so order lines keep the priced fabric. */
  fabricId: z.string().min(1).max(64).nullable().default(null),
  collar: z.enum(COLLAR_VARIANTS),
  sleeves: z.enum(SLEEVE_VARIANTS),
  view: z.enum(VIEW_PRESETS),
  placements: z.array(visualAssetPlacementSchema).max(24),
});

export type StoredGarmentConfig = z.infer<typeof garmentConfigSchema>;

/**
 * Wizard/home flow state persisted on configurator_drafts.payload. `.passthrough()`
 * keeps forward compatibility: drafts written by newer versions survive
 * older readers and vice versa.
 */
export const draftPayloadSchema = z
  .object({
    /** Order flow type — mirrors createPublicOrder's client-kind switch. */
    type: z.enum(["new", "returning"]).optional(),
    customerType: z.enum(["club", "empresa", "colegio", "institucion", "particular"]).optional(),
    contactId: z.string().max(64).nullish(),
    organizationId: z.string().max(64).nullish(),
    name: z.string().max(255).optional(),
    email: z.string().max(255).optional(),
    phone: z.string().max(64).optional(),
    organizationName: z.string().max(255).optional(),
    notes: z.string().max(4000).optional(),
    productId: z.string().max(64).optional(),
    fabricId: z.string().max(64).nullish(),
    techniqueId: z.string().max(64).nullish(),
    techniqueIds: z.array(z.string().max(64)).max(20).optional(),
    sizeQuantities: z
      .array(z.object({ sizeId: z.string().max(64).nullable(), quantity: z.number().int().min(1).max(1000) }))
      .max(32)
      .optional(),
    /** Per-unit personalization (names/numbers) — PII stays server-side, never in URL. */
    lineItems: z
      .array(
        z.object({
          sizeId: z.string().max(64).nullable(),
          sizeLabel: z.string().max(32).optional(),
          individualName: z.string().max(128).nullish(),
          individualNumber: z.string().max(32).nullish(),
        }),
      )
      .max(1000)
      .optional(),
    uploadSessionId: z.string().max(64).optional(),
    urgent: z.boolean().optional(),
    step: z.number().int().min(1).max(5).optional(),
  })
  .passthrough();

export type DraftPayload = z.infer<typeof draftPayloadSchema>;

/** Input accepted when a client saves one configured product into a draft. */
export const draftItemInputSchema = z.object({
  productId: z.string().min(1).max(64),
  config: garmentConfigSchema,
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export type DraftItemInput = z.infer<typeof draftItemInputSchema>;

/** Public draft token shape: `cfg_` + 43-char base64url secret. */
export const DRAFT_TOKEN_RE = /^cfg_[A-Za-z0-9_-]{32,64}$/;

export function isDraftToken(value: unknown): value is string {
  return typeof value === "string" && DRAFT_TOKEN_RE.test(value);
}
