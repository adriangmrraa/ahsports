import "server-only";

import { and, asc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { bomItems, bomRecipes, garmentMolds, materials, productTaxonomyNodes, products, sizes, techniques } from "@/db/schema";
import type { AgentTool } from "@/lib/agents/tools/types";
import { withAuditLog } from "@/lib/telegram/confirmations";

/**
 * Operator catalog tools — textile mapping of SocialCRM `toolsProduct.ts`:
 * food categories/menu → garments + textile taxonomy + BOM/recipes + talles.
 * BOM and molds stay read-only here (the admin surface owns them); the bot
 * may only touch basic product fields.
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

export const productTools = [searchProductsTool, getProductDetailTool, listTechniquesTool, listTaxonomyTool, updateProductBasicsTool] as const;
