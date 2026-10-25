import "server-only";

import { randomBytes } from "node:crypto";

import { and, asc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { bomItems, bomRecipes, garmentMolds, materials, productTaxonomyNodes, products, sizes, techniques } from "@/db/schema";
import { GARMENT_FAMILIES, GARMENT_TYPES } from "@/lib/garments";
import { replaceBundleItems, validateProductClassification, validateProductStructure } from "@/lib/product-domain";
import { isUniqueViolation, productSchema } from "@/lib/validators";
import type { AgentTool } from "@/lib/agents/tools/types";
import { nameOrId, resolutionError, resolveMold, resolveProduct, withPreviewConfirmation, type PreviewOutcome } from "@/lib/telegram/catalog-resolve";
import { withAuditLog } from "@/lib/telegram/confirmations";

/**
 * Operator catalog tools — textile mapping of SocialCRM `toolsProduct.ts`:
 * food categories/menu → garments + textile taxonomy + BOM/recipes + talles.
 * BOM recipes and option matrices live in their own tool files; this file
 * keeps product reads plus the basic-field writes (price, active, create).
 */

const idLike = z.string().trim().min(1).max(64);

const searchProductsInput = z.object({
  query: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(128).optional(),
  includeInactive: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const searchProductsTool: AgentTool<z.infer<typeof searchProductsInput>> = {
  id: "searchProducts",
  description: "Busca productos del catálogo por nombre, SKU, categoría o tipo (remera, chomba, campera, conjunto…). Solo lectura.",
  effect: "read",
  inputSchema: searchProductsInput,
  async handler({ query, category, includeInactive, limit }) {
    const filters = [];
    if (!includeInactive) filters.push(eq(products.active, true));
    if (query) {
      filters.push(
        or(
          ilike(products.name, `%${query}%`),
          ilike(products.sku, `%${query}%`),
          ilike(products.productType, `%${query}%`),
          ilike(products.garmentType, `%${query}%`),
        ),
      );
    }
    if (category) filters.push(ilike(products.productCategory, `%${category}%`));
    const rows = await db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        productCategory: products.productCategory,
        productType: products.productType,
        garmentType: products.garmentType,
        productKind: products.productKind,
        basePrice: products.basePrice,
        minOrder: products.minOrder,
        active: products.active,
      })
      .from(products)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(products.name))
      .limit(limit ?? 15);
    return { ok: true as const, count: rows.length, products: rows };
  },
};

const getProductDetailInput = z.object({ productId: idLike.optional(), sku: z.string().trim().min(1).max(64).optional() });

export const getProductDetailTool: AgentTool<z.infer<typeof getProductDetailInput>> = {
  id: "getProductDetail",
  description:
    "Detalle de un producto: datos, talles, recetas (BOM) con insumos y moldes asociados. Clave antes de cotizar o recotizar. Solo lectura.",
  effect: "read",
  inputSchema: getProductDetailInput,
  async handler({ productId, sku }) {
    if (!productId && !sku) return { found: false as const, error: "missing_criteria" as const };
    const [product] = await db
      .select()
      .from(products)
      .where(productId ? eq(products.id, productId) : eq(products.sku, sku!))
      .limit(1);
    if (!product) return { found: false as const, error: "not_found" as const };

    const sizeRows = await db.select().from(sizes).where(eq(sizes.productId, product.id)).orderBy(asc(sizes.order));

    const recipes = await db
      .select({
        id: bomRecipes.id,
        sizeId: bomRecipes.sizeId,
        techniqueId: bomRecipes.techniqueId,
        sizeLabel: sizes.label,
        technique: techniques.name,
      })
      .from(bomRecipes)
      .leftJoin(sizes, eq(bomRecipes.sizeId, sizes.id))
      .leftJoin(techniques, eq(bomRecipes.techniqueId, techniques.id))
      .where(eq(bomRecipes.productId, product.id));

    const recipeIds = recipes.map((row) => row.id);
    const items = recipeIds.length
      ? await db
          .select({
            recipeId: bomItems.recipeId,
            material: materials.name,
            unit: materials.unit,
            consumptionMode: bomItems.consumptionMode,
            quantity: bomItems.quantity,
            unitsPerConsumptionUnit: bomItems.unitsPerConsumptionUnit,
            wastePercent: bomItems.wastePercent,
          })
          .from(bomItems)
          .leftJoin(materials, eq(bomItems.materialId, materials.id))
          .where(or(...recipeIds.map((rid) => eq(bomItems.recipeId, rid))))
      : [];

    const [mold] = product.moldId
      ? await db.select({ id: garmentMolds.id, name: garmentMolds.name, family: garmentMolds.family }).from(garmentMolds).where(eq(garmentMolds.id, product.moldId)).limit(1)
      : [null];

    return {
      found: true as const,
      product,
      sizes: sizeRows.map((row) => ({ id: row.id, label: row.label, order: row.order, measurements: row.measurements })),
      recipes: recipes.map((recipe) => ({
        ...recipe,
        items: items.filter((item) => item.recipeId === recipe.id),
      })),
      mold,
    };
  },
};

const listTechniquesInput = z.object({ includeInactive: z.boolean().optional() });

export const listTechniquesTool: AgentTool<z.infer<typeof listTechniquesInput>> = {
  id: "listTechniques",
  description: "Lista técnicas de personalización (estampado, bordado, sublimado, DTF…) con sus costos. Solo lectura.",
  effect: "read",
  inputSchema: listTechniquesInput,
  async handler({ includeInactive }) {
    const rows = await db
      .select()
      .from(techniques)
      .where(includeInactive ? undefined : eq(techniques.active, true))
      .orderBy(asc(techniques.name));
    return { ok: true as const, count: rows.length, techniques: rows };
  },
};

const listTaxonomyInput = z.object({ kind: z.enum(["category", "subcategory", "type"]).optional() });

export const listTaxonomyTool: AgentTool<z.infer<typeof listTaxonomyInput>> = {
  id: "listTaxonomy",
  description: "Lista el catálogo de clasificación de productos (categorías, subcategorías, tipos). Solo lectura.",
  effect: "read",
  inputSchema: listTaxonomyInput,
  async handler({ kind }) {
    const rows = await db
      .select({ id: productTaxonomyNodes.id, kind: productTaxonomyNodes.kind, value: productTaxonomyNodes.value, label: productTaxonomyNodes.label, parentId: productTaxonomyNodes.parentId })
      .from(productTaxonomyNodes)
      .where(kind ? eq(productTaxonomyNodes.kind, kind) : eq(productTaxonomyNodes.active, true))
      .orderBy(asc(productTaxonomyNodes.kind), asc(productTaxonomyNodes.sortOrder))
      .limit(200);
    return { ok: true as const, count: rows.length, nodes: rows };
  },
};

const updateProductBasicsInput = z.object({
  productId: idLike,
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(4000).nullish(),
  basePrice: z.number().min(0).max(1_000_000_000).optional(),
  minOrder: z.number().int().min(1).max(100000).optional(),
  active: z.boolean().optional(),
});

export const updateProductBasicsTool = withAuditLog({
  id: "updateProductBasics",
  description:
    "Edita campos básicos de un producto (nombre, descripción, precio base, pedido mínimo, activo). No toca BOM, talles ni moldes. Reversible, queda auditado.",
  effect: "draft",
  inputSchema: updateProductBasicsInput,
  async handler(input) {
    const { productId, ...fields } = input;
    const updates: Record<string, unknown> = {};
    if (fields.name !== undefined) updates.name = fields.name;
    if (fields.description !== undefined) updates.description = fields.description;
    if (fields.basePrice !== undefined) updates.basePrice = fields.basePrice.toFixed(2);
    if (fields.minOrder !== undefined) updates.minOrder = fields.minOrder;
    if (fields.active !== undefined) updates.active = fields.active;
    if (Object.keys(updates).length === 0) return { ok: false as const, error: "nothing_to_update" as const };
    const [updated] = await db.update(products).set(updates).where(eq(products.id, productId)).returning({ id: products.id });
    if (!updated) return { ok: false as const, error: "not_found" as const };
    return { ok: true as const, productId: updated.id };
  },
} satisfies AgentTool<z.infer<typeof updateProductBasicsInput>>);

// ── Product writes ──────────────────────────────────────────────────────────

const money = (value: number) => `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const createProductInput = z.object({
  name: z.string().trim().min(1).max(255).describe("Nombre del producto"),
  sku: z.string().trim().min(1).max(64).optional().describe("SKU; si falta se genera uno a partir del nombre"),
  description: z.string().trim().max(4000).nullish(),
  productCategory: z.string().trim().min(1).max(128).optional().describe("Categoría de taxonomía (default indumentaria)"),
  productSubcategory: z.string().trim().min(1).max(128).optional().describe("Subcategoría (default prendas)"),
  productType: z.string().trim().min(1).max(128).optional().describe("Tipo (default otro)"),
  garmentFamily: z.enum(GARMENT_FAMILIES).nullish().describe("Familia de prenda (requisito si se pasa molde)"),
  garmentType: z.enum(GARMENT_TYPES).nullish().describe("Tipo de prenda: remera, chomba, campera…"),
  mold: nameOrId.nullish().describe("Molde base por nombre o id (opcional)"),
  basePrice: z.number().finite().min(0).max(1_000_000_000).optional().describe("Precio base de venta (default 0 — cotiza por receta+margen)"),
  minOrder: z.number().int().min(1).max(100000).optional().describe("Pedido mínimo en unidades (default 1)"),
  active: z.boolean().optional().describe("Default true"),
});

/** Deterministic readable SKU: name-slug + short random suffix (crypto, no Math.random). */
function generateSku(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "PROD";
  return `${base}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/** Same type→family mapping productSchema's superRefine enforces. */
const FAMILY_BY_TYPE: Record<(typeof GARMENT_TYPES)[number], (typeof GARMENT_FAMILIES)[number] | undefined> = {
  remera: "parte_superior",
  chomba: "parte_superior",
  camiseta: "parte_superior",
  campera: "campera",
  pantalon: "pantalon",
  short: "short_futbol",
  bermuda: "bermuda",
  conjunto: undefined,
  accesorio: "accesorio",
};

type CreateTarget =
  | { ok: true; data: z.infer<typeof productSchema>; moldName: string | null }
  | { ok: false; result: unknown };

async function resolveCreateProduct(input: z.infer<typeof createProductInput>): Promise<CreateTarget> {
  let moldId: string | null = null;
  let moldName: string | null = null;
  if (input.mold) {
    const mold = await resolveMold(input.mold);
    if (!mold.ok) return { ok: false, result: { ...resolutionError(input.mold, mold), entity: "mold" } };
    moldId = mold.value.id;
    moldName = mold.value.name;
  }
  const assembled = {
    sku: input.sku ?? generateSku(input.name),
    name: input.name,
    description: input.description ?? null,
    productKind: "garment" as const,
    productCategory: input.productCategory ?? "indumentaria",
    productSubcategory: input.productSubcategory ?? "prendas",
    productType: input.productType ?? "otro",
    // Derive family from type so "pantalon" doesn't need garmentFamily spelled
    // out (productSchema rejects type/family mismatches).
    garmentFamily: input.garmentFamily ?? (input.garmentType ? FAMILY_BY_TYPE[input.garmentType] ?? null : null),
    garmentType: input.garmentType ?? null,
    moldId,
    bundleItems: [],
    basePrice: input.basePrice ?? 0,
    minOrder: input.minOrder ?? 1,
    zones: [],
  };
  const parsed = productSchema.safeParse(assembled);
  if (!parsed.success) {
    return {
      ok: false,
      result: { ok: false as const, error: "invalid_product" as const, message: parsed.error.issues.map((issue) => issue.message).join(" ").slice(0, 400) },
    };
  }
  const classificationError = await validateProductClassification(parsed.data.productCategory, parsed.data.productSubcategory, parsed.data.productType);
  if (classificationError) return { ok: false, result: { ok: false as const, error: "invalid_taxonomy" as const, message: classificationError } };
  const structureError = await validateProductStructure({ productKind: "garment", garmentFamily: parsed.data.garmentFamily, moldId: parsed.data.moldId });
  if (structureError) return { ok: false, result: { ok: false as const, error: "invalid_structure" as const, message: structureError } };
  return { ok: true, data: parsed.data, moldName };
}

async function createProductPreview(input: z.infer<typeof createProductInput>): Promise<PreviewOutcome> {
  const resolved = await resolveCreateProduct(input);
  if (!resolved.ok) return { ok: false, result: resolved.result };
  return {
    ok: true,
    description: `Crear producto "${resolved.data.name}" — SKU ${input.sku ?? "auto"}, precio base ${money(resolved.data.basePrice)}, pedido mínimo ${resolved.data.minOrder}${resolved.moldName ? `, molde ${resolved.moldName}` : ""}`,
    preview: {
      sku: input.sku ?? "(se genera al crear)",
      name: resolved.data.name,
      productCategory: resolved.data.productCategory,
      productSubcategory: resolved.data.productSubcategory,
      productType: resolved.data.productType,
      garmentFamily: resolved.data.garmentFamily,
      garmentType: resolved.data.garmentType,
      mold: resolved.moldName,
      basePrice: resolved.data.basePrice,
      minOrder: resolved.data.minOrder,
      active: input.active ?? true,
    },
  };
}

const createProductInner: AgentTool<z.infer<typeof createProductInput>> = {
  id: "createProduct",
  description:
    "Crea un producto nuevo del catálogo (prenda individual). Valida taxonomía, tipo/familia y molde como el formulario admin. Devuelve la URL del editor para completar talles/receta/opciones.",
  effect: "draft",
  inputSchema: createProductInput,
  async handler(input) {
    const resolved = await resolveCreateProduct(input);
    if (!resolved.ok) return resolved.result;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const [row] = await db.insert(products).values({
          sku: input.sku ?? generateSku(input.name),
          name: resolved.data.name,
          description: resolved.data.description ?? null,
          productKind: "garment",
          productCategory: resolved.data.productCategory,
          productSubcategory: resolved.data.productSubcategory,
          productType: resolved.data.productType,
          garmentFamily: resolved.data.garmentFamily,
          garmentType: resolved.data.garmentType,
          moldId: resolved.data.moldId ?? null,
          basePrice: String(resolved.data.basePrice),
          minOrder: resolved.data.minOrder,
          active: input.active ?? true,
          zones: resolved.data.zones,
        }).returning({ id: products.id });
        await replaceBundleItems(row.id, []);
        return { ok: true as const, productId: row.id, adminUrl: `/admin/productos/${row.id}` };
      } catch (error) {
        if (isUniqueViolation(error) && input.sku) {
          return { ok: false as const, error: "sku_exists" as const, message: `El SKU "${input.sku}" ya existe.` };
        }
        if (!isUniqueViolation(error)) throw error;
        // Generated SKU collision → retry with a fresh suffix.
      }
    }
    return { ok: false as const, error: "sku_exists" as const, message: "No se pudo generar un SKU único; pasá uno manual." };
  },
};

export const createProductTool = withPreviewConfirmation(createProductInner, createProductPreview);

const setProductPriceInput = z.object({
  product: nameOrId.describe("Producto por nombre, SKU o id"),
  basePrice: z.number().finite().min(0).max(1_000_000_000).describe("Nuevo precio base de venta"),
});

async function setPricePreview(input: z.infer<typeof setProductPriceInput>): Promise<PreviewOutcome> {
  const product = await resolveProduct(input.product);
  if (!product.ok) return { ok: false, result: { ...resolutionError(input.product, product), entity: "product" } };
  const from = Number(product.value.basePrice);
  return {
    ok: true,
    description: `Cambiar precio base de "${product.value.name}": ${money(from)} → ${money(input.basePrice)}`,
    preview: { productId: product.value.id, name: product.value.name, basePrice: { from, to: input.basePrice } },
  };
}

const setProductPriceInner: AgentTool<z.infer<typeof setProductPriceInput>> = {
  id: "setProductPrice",
  description: "Cambia SOLO el precio base de venta de un producto — el ajuste rápido más frecuente.",
  effect: "draft",
  inputSchema: setProductPriceInput,
  async handler(input) {
    const product = await resolveProduct(input.product);
    if (!product.ok) return { ...resolutionError(input.product, product), entity: "product" };
    const [row] = await db.update(products).set({ basePrice: String(input.basePrice) }).where(eq(products.id, product.value.id)).returning({ id: products.id });
    if (!row) return { ok: false as const, error: "not_found" as const };
    return { ok: true as const, productId: row.id, basePrice: input.basePrice };
  },
};

export const setProductPriceTool = withPreviewConfirmation(setProductPriceInner, setPricePreview);

const setProductActiveInput = z.object({
  product: nameOrId.describe("Producto por nombre, SKU o id"),
  active: z.boolean().describe("true = visible/cotizable; false = oculto del catálogo público"),
});

async function setActivePreview(input: z.infer<typeof setProductActiveInput>): Promise<PreviewOutcome> {
  const product = await resolveProduct(input.product);
  if (!product.ok) return { ok: false, result: { ...resolutionError(input.product, product), entity: "product" } };
  if (product.value.active === input.active) {
    return {
      ok: false,
      result: { ok: false as const, error: "no_change" as const, message: `"${product.value.name}" ya está ${input.active ? "activo" : "inactivo"}.` },
    };
  }
  return {
    ok: true,
    description: `${input.active ? "Activar" : "Desactivar"} producto "${product.value.name}"${input.active ? "" : " — deja de aparecer en el catálogo público y en cotizaciones nuevas"}`,
    preview: { productId: product.value.id, name: product.value.name, active: { from: product.value.active, to: input.active } },
  };
}

const setProductActiveInner: AgentTool<z.infer<typeof setProductActiveInput>> = {
  id: "setProductActive",
  description: "Activa o desactiva un producto (lo oculta del catálogo público sin borrarlo).",
  effect: "draft",
  inputSchema: setProductActiveInput,
  async handler(input) {
    const product = await resolveProduct(input.product);
    if (!product.ok) return { ...resolutionError(input.product, product), entity: "product" };
    const [row] = await db.update(products).set({ active: input.active }).where(eq(products.id, product.value.id)).returning({ id: products.id });
    if (!row) return { ok: false as const, error: "not_found" as const };
    return { ok: true as const, productId: row.id, active: input.active };
  },
};

export const setProductActiveTool = withPreviewConfirmation(setProductActiveInner, setActivePreview);

export const productTools = [
  searchProductsTool,
  getProductDetailTool,
  listTechniquesTool,
  listTaxonomyTool,
  updateProductBasicsTool,
  createProductTool,
  setProductPriceTool,
  setProductActiveTool,
] as const;
