import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { bomItems, bomRecipes, orderLines, pricingRules, products, sizes, techniques } from "@/db/schema";
import { calculateBomConsumption, consumptionUnit, type ConsumptionMode } from "@/lib/consumption";
import { consumptionUnitCost } from "@/lib/pricing";
import type { AgentTool } from "@/lib/agents/tools/types";
import {
  nameOrId,
  resolutionError,
  resolveMaterial,
  resolveProduct,
  resolveSize,
  resolveTechnique,
  withPreviewConfirmation,
  type MaterialRow,
  type PreviewOutcome,
  type TechniqueRow,
} from "@/lib/telegram/catalog-resolve";

/**
 * Operator BOM/recipe tools.
 *
 * A recipe (`bom_recipes`) binds (product, size?, technique?) → items
 * (`bom_items`) with consumption modes and waste. Item material cost feeds
 * `quoteOrder`'s unit cost through `calculateBomConsumption` +
 * `consumptionUnitCost` (kilo → metre), the same math the admin surface and
 * the pricing engine use — the bot reuses it instead of re-implementing.
 *
 * All mutations run through `withPreviewConfirmation`: the first call only
 * resolves refs, computes the resulting unit cost and queues the pending
 * action; a `CONFIRM <token>` re-runs the inner handler that writes inside a
 * transaction.
 */

const money = (value: number) => `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Shared item resolution + cost math ──────────────────────────────────────

const bomItemInput = z.object({
  material: nameOrId.describe("Insumo por nombre o id"),
  quantity: z.number().finite().positive().max(100000).optional()
    .describe("Cantidad directa del insumo por prenda, en su unidad de consumo (modo directo)"),
  consumptionMode: z.enum(["direct", "yield"]).optional()
    .describe("direct = cantidad por prenda (default); yield = cuántas prendas rinde una unidad de consumo"),
  unitsPerConsumptionUnit: z.number().finite().positive().max(100000).optional()
    .describe("Solo modo yield: prendas que salen de una unidad de consumo"),
  wastePercent: z.number().min(0).max(100).optional().describe("Merma en %, 0-100 (default 0)"),
});

type BomItemInput = z.infer<typeof bomItemInput>;

export type ResolvedBomItem = {
  material: MaterialRow;
  input: BomItemInput;
  mode: ConsumptionMode;
  directQuantity: number | null;
  unitsPerConsumptionUnit: number | null;
  baseQuantityPerUnit: number;
  calculatedQuantityPerUnit: number;
  wastePercent: number;
  unitCostPerConsumptionUnit: number;
  costPerGarment: number;
};

type ItemResolution =
  | { ok: true; items: ResolvedBomItem[] }
  | { ok: false; result: unknown };

/** Resolves every material ref and computes per-item quantities + costs. */
async function resolveBomItems(inputs: BomItemInput[]): Promise<ItemResolution> {
  const seen = new Set<string>();
  const items: ResolvedBomItem[] = [];
  for (const input of inputs) {
    const material = await resolveMaterial(input.material);
    if (!material.ok) return { ok: false, result: { ...resolutionError(input.material, material), entity: "material" } };
    if (seen.has(material.value.id)) {
      return {
        ok: false,
        result: { ok: false as const, error: "duplicate_material" as const, message: `El insumo "${material.value.name}" está repetido en la lista.` },
      };
    }
    seen.add(material.value.id);
    if (material.value.unit === "kilo" && (!material.value.metersPerKilo || Number(material.value.metersPerKilo) <= 0)) {
      return {
        ok: false,
        result: {
          ok: false as const,
          error: "material_missing_yield" as const,
          message: `El insumo "${material.value.name}" se compra por kilo y no tiene metros/kilo cargados.`,
        },
      };
    }
    let calculated;
    try {
      calculated = calculateBomConsumption({
        mode: input.consumptionMode ?? "direct",
        directQuantity: input.quantity ?? null,
        unitsPerConsumptionUnit: input.unitsPerConsumptionUnit ?? null,
        legacyQuantity: input.quantity ?? null,
        wastePercent: input.wastePercent ?? 0,
        materialName: material.value.name,
      });
    } catch (error) {
      return {
        ok: false,
        result: {
          ok: false as const,
          error: "invalid_item" as const,
          material: material.value.name,
          message: error instanceof Error ? error.message : "Consumo inválido.",
        },
      };
    }
    const unitCost = consumptionUnitCost(material.value);
    items.push({
      material: material.value,
      input,
      mode: calculated.mode,
      directQuantity: calculated.directQuantity,
      unitsPerConsumptionUnit: calculated.unitsPerConsumptionUnit,
      baseQuantityPerUnit: calculated.baseQuantityPerUnit,
      calculatedQuantityPerUnit: calculated.calculatedQuantityPerUnit,
      wastePercent: calculated.wastePercent,
      unitCostPerConsumptionUnit: unitCost,
      costPerGarment: calculated.calculatedQuantityPerUnit * unitCost,
    });
  }
  return { ok: true, items };
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const round4 = (value: number) => Math.round(value * 10000) / 10000;

/** Material + recipe-technique cost of one garment. Shared by list/preview/upsert. */
function recipeUnitCost(items: Array<{ costPerGarment: number }>, technique: Pick<TechniqueRow, "costPerUnit"> | null) {
  const materialUnitCost = items.reduce((total, item) => total + item.costPerGarment, 0);
  const techniqueCostPerUnit = technique ? Number(technique.costPerUnit) : 0;
  return { materialUnitCost: round2(materialUnitCost), techniqueCostPerUnit: round2(techniqueCostPerUnit), unitCost: round2(materialUnitCost + techniqueCostPerUnit) };
}

function itemPreview(item: ResolvedBomItem) {
  return {
    materialId: item.material.id,
    material: item.material.name,
    unit: consumptionUnit(item.material.unit),
    consumptionMode: item.mode,
    baseQuantityPerUnit: round4(item.baseQuantityPerUnit),
    calculatedQuantityPerUnit: round4(item.calculatedQuantityPerUnit),
    wastePercent: item.wastePercent,
    unitCostPerConsumptionUnit: round2(item.unitCostPerConsumptionUnit),
    costPerGarment: round2(item.costPerGarment),
  };
}

// ── Recipe lookup ───────────────────────────────────────────────────────────

type RecipeRow = typeof bomRecipes.$inferSelect;

/** Recipe identity = (productId, sizeId|null, techniqueId|null). */
function findRecipe(recipes: RecipeRow[], sizeId: string | null, techniqueId: string | null): RecipeRow | undefined {
  return recipes.find((recipe) => recipe.sizeId === sizeId && recipe.techniqueId === techniqueId);
}

async function recipeLabel(recipe: RecipeRow): Promise<string> {
  const parts: string[] = [];
  if (recipe.techniqueId) {
    const [technique] = await db.select({ name: techniques.name }).from(techniques).where(eq(techniques.id, recipe.techniqueId)).limit(1);
    parts.push(`técnica ${technique?.name ?? recipe.techniqueId}`);
  } else {
    parts.push("genérica");
  }
  if (recipe.sizeId) {
    const [size] = await db.select({ label: sizes.label }).from(sizes).where(eq(sizes.id, recipe.sizeId)).limit(1);
    parts.push(`talle ${size?.label ?? recipe.sizeId}`);
  } else {
    parts.push("todos los talles");
  }
  return parts.join(", ");
}

type ProductTechSizeRefs = { product: string; technique?: string | null | undefined; size?: string | null | undefined };

type RecipeTarget =
  | { ok: true; product: { id: string; name: string }; technique: TechniqueRow | null; sizeId: string | null; sizeLabel: string | null; recipe: RecipeRow | undefined; recipes: RecipeRow[] }
  | { ok: false; result: unknown };

async function resolveRecipeTarget(input: ProductTechSizeRefs): Promise<RecipeTarget> {
  const product = await resolveProduct(input.product);
  if (!product.ok) return { ok: false, result: { ...resolutionError(input.product, product), entity: "product" } };

  let technique: TechniqueRow | null = null;
  if (input.technique) {
    const resolved = await resolveTechnique(input.technique);
    if (!resolved.ok) return { ok: false, result: { ...resolutionError(input.technique, resolved), entity: "technique" } };
    technique = resolved.value;
  }

  const size = await resolveSize(product.value.id, input.size);
  if (!size.ok) return { ok: false, result: { ...resolutionError(input.size ?? "", size), entity: "size" } };

  const recipes = await db.select().from(bomRecipes).where(eq(bomRecipes.productId, product.value.id));
  const recipe = findRecipe(recipes, size.value?.id ?? null, technique?.id ?? null);
  return {
    ok: true,
    product: { id: product.value.id, name: product.value.name },
    technique,
    sizeId: size.value?.id ?? null,
    sizeLabel: size.value?.label ?? null,
    recipe,
    recipes,
  };
}

// ── listProductRecipes ──────────────────────────────────────────────────────

const listProductRecipesInput = z.object({
  product: nameOrId.describe("Producto por nombre, SKU o id"),
});

export const listProductRecipesTool: AgentTool<z.infer<typeof listProductRecipesInput>> = {
  id: "listProductRecipes",
  description:
    "Lista las recetas (BOM) de un producto con insumos, cantidades, unidades, merma y el costo unitario calculado (materiales + costo de la técnica). Solo lectura.",
  effect: "read",
  inputSchema: listProductRecipesInput,
  async handler({ product }) {
    const resolved = await resolveProduct(product);
    if (!resolved.ok) return { ...resolutionError(product, resolved), entity: "product" };
    const recipes = await db.select().from(bomRecipes).where(eq(bomRecipes.productId, resolved.value.id));
    const sizeRows = await db.select({ id: sizes.id, label: sizes.label }).from(sizes).where(eq(sizes.productId, resolved.value.id));
    const sizeLabelById = new Map(sizeRows.map((row) => [row.id, row.label]));

    const result = [];
    for (const recipe of recipes) {
      const items = await db.select().from(bomItems).where(eq(bomItems.recipeId, recipe.id));
      const [technique] = recipe.techniqueId
        ? await db.select().from(techniques).where(eq(techniques.id, recipe.techniqueId)).limit(1)
        : [null];
      const resolvedItems: ResolvedBomItem[] = [];
      for (const item of items) {
        const material = await resolveMaterial(item.materialId);
        if (!material.ok) continue;
        const unitCost = consumptionUnitCost(material.value);
        const calculated = calculateBomConsumption({
          mode: item.consumptionMode,
          directQuantity: item.directQuantity,
          unitsPerConsumptionUnit: item.unitsPerConsumptionUnit,
          legacyQuantity: item.quantity,
          wastePercent: item.wastePercent,
          materialName: material.value.name,
        });
        resolvedItems.push({
          material: material.value,
          input: { material: material.value.id, consumptionMode: item.consumptionMode, wastePercent: Number(item.wastePercent) },
          mode: calculated.mode,
          directQuantity: calculated.directQuantity,
          unitsPerConsumptionUnit: calculated.unitsPerConsumptionUnit,
          baseQuantityPerUnit: calculated.baseQuantityPerUnit,
          calculatedQuantityPerUnit: calculated.calculatedQuantityPerUnit,
          wastePercent: calculated.wastePercent,
          unitCostPerConsumptionUnit: unitCost,
          costPerGarment: calculated.calculatedQuantityPerUnit * unitCost,
        });
      }
      result.push({
        recipeId: recipe.id,
        technique: technique ? { id: technique.id, name: technique.name } : null,
        sizeId: recipe.sizeId,
        sizeLabel: recipe.sizeId ? sizeLabelById.get(recipe.sizeId) ?? null : null,
        notes: recipe.notes,
        items: resolvedItems.map((item) => ({ itemId: items.find((row) => row.materialId === item.material.id)?.id, ...itemPreview(item) })),
        ...recipeUnitCost(resolvedItems, technique),
      });
    }
    return { ok: true as const, product: { id: resolved.value.id, name: resolved.value.name }, count: result.length, recipes: result };
  },
};

// ── previewRecipeCost ───────────────────────────────────────────────────────

const previewRecipeCostInput = z.object({
  items: z.array(bomItemInput).min(1).max(60),
  technique: nameOrId.nullish().describe("Técnica de la receta (suma su costo por unidad al costo)"),
});

export const previewRecipeCostTool: AgentTool<z.infer<typeof previewRecipeCostInput>> = {
  id: "previewRecipeCost",
  description:
    "Calcula el costo unitario de una receta propuesta SIN guardar nada: sirve para iterar precios/insumos por voz antes de cargar o actualizar el BOM. Muestra costo de materiales, costo por unidad total y precio sugerido con el margen activo. Solo lectura.",
  effect: "read",
  inputSchema: previewRecipeCostInput,
  async handler({ items, technique }) {
    const resolved = await resolveBomItems(items);
    if (!resolved.ok) return resolved.result;

    let techniqueRow: TechniqueRow | null = null;
    if (technique) {
      const resolvedTechnique = await resolveTechnique(technique);
      if (!resolvedTechnique.ok) return { ...resolutionError(technique, resolvedTechnique), entity: "technique" };
      techniqueRow = resolvedTechnique.value;
    }

    const costs = recipeUnitCost(resolved.items, techniqueRow);

    const [rule] = await db.select().from(pricingRules).where(eq(pricingRules.active, true)).limit(1);
    const marginPercent = rule ? Number(rule.marginPercent) : null;
    const rounding = rule ? Number(rule.rounding) || 1 : 1;
    const suggestedUnitPrice = marginPercent == null
      ? null
      : Math.round((costs.unitCost * (1 + marginPercent / 100)) / rounding) * rounding;

    return {
      ok: true as const,
      previewOnly: true as const,
      items: resolved.items.map(itemPreview),
      ...costs,
      pricing: {
        rule: rule ? { id: rule.id, name: rule.name, marginPercent, rounding } : null,
        suggestedUnitPrice,
      },
    };
  },
};

// ── upsertBomRecipe ─────────────────────────────────────────────────────────

const recipeTargetFields = {
  product: nameOrId.describe("Producto por nombre, SKU o id"),
  technique: nameOrId.nullish().describe("Técnica de la receta; omitir para la receta genérica"),
  size: nameOrId.nullish().describe("Talle (label o id); omitir para la receta que aplica a todos los talles"),
};

/** Same refs but optional: used when recipeId already locates the row. */
const recipeTargetOptional = {
  product: nameOrId.optional().describe("Producto por nombre, SKU o id"),
  technique: nameOrId.nullish().describe("Técnica de la receta; omitir para la receta genérica"),
  size: nameOrId.nullish().describe("Talle (label o id); omitir para la receta que aplica a todos los talles"),
};

const upsertBomRecipeInput = z.object({
  ...recipeTargetFields,
  notes: z.string().trim().max(2000).nullish(),
  items: z.array(bomItemInput).min(1).max(60),
});

async function upsertRecipePreview(input: z.infer<typeof upsertBomRecipeInput>): Promise<PreviewOutcome> {
  const target = await resolveRecipeTarget(input);
  if (!target.ok) return { ok: false, result: target.result };
  const resolved = await resolveBomItems(input.items);
  if (!resolved.ok) return { ok: false, result: resolved.result };

  const costs = recipeUnitCost(resolved.items, target.technique);
  const action = target.recipe ? "actualizar" : "crear";
  const scope = `${target.technique ? target.technique.name : "genérica"}, ${target.sizeLabel ? `talle ${target.sizeLabel}` : "todos los talles"}`;
  const description = [
    `${action === "crear" ? "Crear" : "Actualizar"} receta de "${target.product.name}" (${scope}): ${resolved.items.length} insumo(s), costo unitario ${money(costs.unitCost)}`,
    ...(target.recipe ? [`reemplaza ${target.recipe.id.slice(0, 8)}… y sus items`] : []),
  ].join(" — ");

  return {
    ok: true,
    description,
    preview: {
      action,
      recipeId: target.recipe?.id ?? null,
      scope: { product: target.product.name, technique: target.technique?.name ?? null, size: target.sizeLabel },
      items: resolved.items.map(itemPreview),
      ...costs,
    },
  };
}

const upsertBomRecipeInner: AgentTool<z.infer<typeof upsertBomRecipeInput>> = {
  id: "upsertBomRecipe",
  description:
    "Crea o reemplaza la receta (BOM) de un producto para una técnica/talle dados: la lista de insumos reemplaza atómicamente a la anterior.",
  effect: "draft",
  inputSchema: upsertBomRecipeInput,
  async handler(input) {
    const target = await resolveRecipeTarget(input);
    if (!target.ok) return target.result;
    const resolved = await resolveBomItems(input.items);
    if (!resolved.ok) return resolved.result;

    const { withDbTransaction } = await import("@/lib/db-transaction");
    const recipeId = await withDbTransaction(async (tx) => {
      let recipe = target.recipe;
      if (!recipe) {
        [recipe] = await tx
          .insert(bomRecipes)
          .values({ productId: target.product.id, sizeId: target.sizeId, techniqueId: target.technique?.id ?? null, notes: input.notes ?? null })
          .returning();
      } else {
        await tx.delete(bomItems).where(eq(bomItems.recipeId, recipe.id));
        if (input.notes !== undefined && input.notes !== null) {
          await tx.update(bomRecipes).set({ notes: input.notes }).where(eq(bomRecipes.id, recipe.id));
        }
      }
      await tx.insert(bomItems).values(
        resolved.items.map((item) => ({
          recipeId: recipe.id,
          materialId: item.material.id,
          consumptionMode: item.mode,
          quantity: String(item.baseQuantityPerUnit),
          directQuantity: item.directQuantity == null ? null : String(item.directQuantity),
          unitsPerConsumptionUnit: item.unitsPerConsumptionUnit == null ? null : String(item.unitsPerConsumptionUnit),
          wastePercent: String(item.wastePercent),
        })),
      );
      return recipe.id;
    });

    const costs = recipeUnitCost(resolved.items, target.technique);
    return { ok: true as const, recipeId, productId: target.product.id, items: resolved.items.length, ...costs };
  },
};

export const upsertBomRecipeTool = withPreviewConfirmation(upsertBomRecipeInner, upsertRecipePreview);

// ── deleteBomRecipe ─────────────────────────────────────────────────────────

const deleteBomRecipeInput = z.object({
  recipeId: nameOrId.optional().describe("Id de la receta (preferido). Si falta, se ubica por product+técnica+talle."),
  ...recipeTargetOptional,
}).refine((value) => Boolean(value.recipeId || value.product), {
  message: "Indicá recipeId o product",
  path: ["recipeId"],
});

type DeleteRecipeTarget =
  | { ok: true; recipe: RecipeRow; product: { id: string; name: string }; label: string; itemsCount: number; referencedByLines: number }
  | { ok: false; result: unknown };

async function resolveDeleteRecipe(input: z.infer<typeof deleteBomRecipeInput>): Promise<DeleteRecipeTarget> {
  let recipe: RecipeRow | undefined;
  let product: { id: string; name: string } | null = null;
  if (input.recipeId) {
    const [row] = await db.select().from(bomRecipes).where(eq(bomRecipes.id, input.recipeId)).limit(1);
    recipe = row;
    if (!recipe) return { ok: false, result: { ok: false as const, error: "not_found" as const, message: "No encontré esa receta." } };
    const [owner] = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, recipe.productId)).limit(1);
    product = owner ? { id: owner.id, name: owner.name } : null;
  } else {
    const target = await resolveRecipeTarget({ product: input.product!, technique: input.technique, size: input.size });
    if (!target.ok) return { ok: false, result: target.result };
    recipe = target.recipe;
    product = target.product;
    if (!recipe) {
      return {
        ok: false,
        result: {
          ok: false as const,
          error: "not_found" as const,
          message: `No hay receta para "${product.name}" con esa técnica/talle.`,
          candidates: target.recipes.map((row) => row.id),
        },
      };
    }
  }
  const items = await db.select({ id: bomItems.id }).from(bomItems).where(eq(bomItems.recipeId, recipe.id));
  const lineRefs = await db.select({ id: orderLines.id }).from(orderLines).where(eq(orderLines.recipeId, recipe.id));
  const [owner] = product
    ? [product]
    : await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, recipe.productId)).limit(1);
  return {
    ok: true,
    recipe,
    product: owner ? { id: owner.id, name: owner.name } : { id: recipe.productId, name: recipe.productId },
    label: await recipeLabel(recipe),
    itemsCount: items.length,
    referencedByLines: lineRefs.length,
  };
}

async function deleteRecipePreview(input: z.infer<typeof deleteBomRecipeInput>): Promise<PreviewOutcome> {
  const target = await resolveDeleteRecipe(input);
  if (!target.ok) return { ok: false, result: target.result };
  const warnings = target.referencedByLines > 0
    ? [`ATENCIÓN: ${target.referencedByLines} línea(s) de pedido referencian esta receta; borrarla puede fallar o dejarlas sin receta.`]
    : [];
  return {
    ok: true,
    description: `Eliminar receta de "${target.product.name}" (${target.label}): ${target.itemsCount} insumo(s)${warnings.length ? ` — ${warnings[0]}` : ""}`,
    preview: { recipeId: target.recipe.id, scope: target.label, items: target.itemsCount, referencedByLines: target.referencedByLines, warnings },
  };
}

const deleteBomRecipeInner: AgentTool<z.infer<typeof deleteBomRecipeInput>> = {
  id: "deleteBomRecipe",
  description: "Elimina una receta (BOM) y sus insumos. Si líneas de pedido la referencian, la operación se rechaza.",
  effect: "draft",
  inputSchema: deleteBomRecipeInput,
  async handler(input) {
    const target = await resolveDeleteRecipe(input);
    if (!target.ok) return target.result;
    if (target.referencedByLines > 0) {
      return {
        ok: false as const,
        error: "recipe_in_use" as const,
        message: `La receta está referenciada por ${target.referencedByLines} línea(s) de pedido. Reasignalas antes de borrarla.`,
        referencedByLines: target.referencedByLines,
      };
    }
    await db.delete(bomRecipes).where(eq(bomRecipes.id, target.recipe.id));
    return { ok: true as const, recipeId: target.recipe.id, deletedItems: target.itemsCount };
  },
};

export const deleteBomRecipeTool = withPreviewConfirmation(deleteBomRecipeInner, deleteRecipePreview);

// ── addRecipeItem / removeRecipeItem ────────────────────────────────────────

const recipeRefInput = {
  recipeId: nameOrId.optional().describe("Id de la receta. Si falta, se ubica por product+técnica+talle."),
  ...recipeTargetOptional,
};

const addRecipeItemInput = z.object({
  ...recipeRefInput,
  item: bomItemInput,
}).refine((value) => Boolean(value.recipeId || value.product), { message: "Indicá recipeId o product", path: ["recipeId"] });

type LocatedRecipe =
  | { ok: true; recipe: RecipeRow; product: { id: string; name: string } }
  | { ok: false; result: unknown };

async function locateRecipe(input: { recipeId?: string; product?: string; technique?: string | null; size?: string | null }): Promise<LocatedRecipe> {
  if (input.recipeId) {
    const [recipe] = await db.select().from(bomRecipes).where(eq(bomRecipes.id, input.recipeId)).limit(1);
    if (!recipe) return { ok: false, result: { ok: false as const, error: "not_found" as const, message: "No encontré esa receta." } };
    const [product] = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, recipe.productId)).limit(1);
    return { ok: true, recipe, product: product ? { id: product.id, name: product.name } : { id: recipe.productId, name: recipe.productId } };
  }
  const target = await resolveRecipeTarget({ product: input.product!, technique: input.technique, size: input.size });
  if (!target.ok) return { ok: false, result: target.result };
  if (!target.recipe) {
    return {
      ok: false,
      result: { ok: false as const, error: "not_found" as const, message: `No hay receta para "${target.product.name}" con esa técnica/talle. Creala con upsertBomRecipe.` },
    };
  }
  return { ok: true, recipe: target.recipe, product: target.product };
}

async function currentRecipeCost(recipeId: string): Promise<{ items: ResolvedBomItem[]; technique: TechniqueRow | null }> {
  const [recipe] = await db.select().from(bomRecipes).where(eq(bomRecipes.id, recipeId)).limit(1);
  const rows = await db.select().from(bomItems).where(eq(bomItems.recipeId, recipeId));
  const items: ResolvedBomItem[] = [];
  for (const row of rows) {
    const material = await resolveMaterial(row.materialId);
    if (!material.ok) continue;
    const unitCost = consumptionUnitCost(material.value);
    const calculated = calculateBomConsumption({
      mode: row.consumptionMode,
      directQuantity: row.directQuantity,
      unitsPerConsumptionUnit: row.unitsPerConsumptionUnit,
      legacyQuantity: row.quantity,
      wastePercent: row.wastePercent,
      materialName: material.value.name,
    });
    items.push({
      material: material.value,
      input: { material: material.value.id, consumptionMode: row.consumptionMode, wastePercent: Number(row.wastePercent) },
      mode: calculated.mode,
      directQuantity: calculated.directQuantity,
      unitsPerConsumptionUnit: calculated.unitsPerConsumptionUnit,
      baseQuantityPerUnit: calculated.baseQuantityPerUnit,
      calculatedQuantityPerUnit: calculated.calculatedQuantityPerUnit,
      wastePercent: calculated.wastePercent,
      unitCostPerConsumptionUnit: unitCost,
      costPerGarment: calculated.calculatedQuantityPerUnit * unitCost,
    });
  }
  const [technique] = recipe?.techniqueId
    ? await db.select().from(techniques).where(eq(techniques.id, recipe.techniqueId)).limit(1)
    : [null];
  return { items, technique: technique ?? null };
}

async function addItemPreview(input: z.infer<typeof addRecipeItemInput>): Promise<PreviewOutcome> {
  const located = await locateRecipe(input);
  if (!located.ok) return { ok: false, result: located.result };
  const resolved = await resolveBomItems([input.item]);
  if (!resolved.ok) return { ok: false, result: resolved.result };
  const existing = await db.select({ id: bomItems.id }).from(bomItems).where(eq(bomItems.recipeId, located.recipe.id));
  const current = await currentRecipeCost(located.recipe.id);
  const next = recipeUnitCost([...current.items, ...resolved.items], current.technique);
  return {
    ok: true,
    description: `Agregar "${resolved.items[0].material.name}" a la receta de "${located.product.name}": costo unitario ${money(recipeUnitCost(current.items, current.technique).unitCost)} → ${money(next.unitCost)}`,
    preview: {
      recipeId: located.recipe.id,
      currentItems: existing.length,
      added: itemPreview(resolved.items[0]),
      before: recipeUnitCost(current.items, current.technique),
      after: next,
    },
  };
}

const addRecipeItemInner: AgentTool<z.infer<typeof addRecipeItemInput>> = {
  id: "addRecipeItem",
  description: "Agrega un insumo a una receta existente sin reenviar la lista completa.",
  effect: "draft",
  inputSchema: addRecipeItemInput,
  async handler(input) {
    const located = await locateRecipe(input);
    if (!located.ok) return located.result;
    const resolved = await resolveBomItems([input.item]);
    if (!resolved.ok) return resolved.result;
    const item = resolved.items[0];
    const existingMaterialIds = (await db.select({ materialId: bomItems.materialId }).from(bomItems).where(eq(bomItems.recipeId, located.recipe.id))).map((row) => row.materialId);
    if (existingMaterialIds.includes(item.material.id)) {
      return { ok: false as const, error: "duplicate_material" as const, message: `La receta ya tiene "${item.material.name}". Para cambiar la cantidad, usá upsertBomRecipe con la lista completa.` };
    }
    const [row] = await db.insert(bomItems).values({
      recipeId: located.recipe.id,
      materialId: item.material.id,
      consumptionMode: item.mode,
      quantity: String(item.baseQuantityPerUnit),
      directQuantity: item.directQuantity == null ? null : String(item.directQuantity),
      unitsPerConsumptionUnit: item.unitsPerConsumptionUnit == null ? null : String(item.unitsPerConsumptionUnit),
      wastePercent: String(item.wastePercent),
    }).returning({ id: bomItems.id });
    return { ok: true as const, recipeId: located.recipe.id, itemId: row.id, material: item.material.name, costPerGarment: round2(item.costPerGarment) };
  },
};

export const addRecipeItemTool = withPreviewConfirmation(addRecipeItemInner, addItemPreview);

const removeRecipeItemInput = z.object({
  recipeItemId: nameOrId.optional().describe("Id del item de la receta (preferido)"),
  ...recipeRefInput,
  material: nameOrId.optional().describe("Insumo a quitar, por nombre o id (si no se pasa recipeItemId)"),
}).refine((value) => Boolean(value.recipeItemId || (value.material && (value.recipeId || value.product))), {
  message: "Indicá recipeItemId, o material junto a recipeId/product",
  path: ["recipeItemId"],
});

type RemoveTarget =
  | { ok: true; recipe: RecipeRow; product: { id: string; name: string }; item: { id: string; materialName: string }; remaining: number; costsAfter: ReturnType<typeof recipeUnitCost> }
  | { ok: false; result: unknown };

async function resolveRemoveItem(input: z.infer<typeof removeRecipeItemInput>): Promise<RemoveTarget> {
  let itemId = input.recipeItemId;
  let recipe: RecipeRow | undefined;
  let product: { id: string; name: string } | undefined;
  if (itemId) {
    const [row] = await db.select().from(bomItems).where(eq(bomItems.id, itemId)).limit(1);
    if (!row) return { ok: false, result: { ok: false as const, error: "not_found" as const, message: "No encontré ese item de receta." } };
    const [owner] = await db.select().from(bomRecipes).where(eq(bomRecipes.id, row.recipeId)).limit(1);
    recipe = owner;
    const [p] = recipe ? await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, recipe.productId)).limit(1) : [];
    product = p ? { id: p.id, name: p.name } : undefined;
  } else {
    const located = await locateRecipe(input);
    if (!located.ok) return { ok: false, result: located.result };
    recipe = located.recipe;
    product = located.product;
    const material = await resolveMaterial(input.material!);
    if (!material.ok) return { ok: false, result: { ...resolutionError(input.material!, material), entity: "material" } };
    const rows = await db.select().from(bomItems).where(eq(bomItems.recipeId, recipe.id));
    const match = rows.find((row) => row.materialId === material.value.id);
    if (!match) {
      return { ok: false, result: { ok: false as const, error: "not_found" as const, message: `La receta no tiene "${material.value.name}".` } };
    }
    itemId = match.id;
  }
  if (!recipe) return { ok: false, result: { ok: false as const, error: "not_found" as const, message: "La receta del item ya no existe." } };

  const [itemRow] = await db.select().from(bomItems).where(eq(bomItems.id, itemId)).limit(1);
  const material = await resolveMaterial(itemRow.materialId);
  const current = await currentRecipeCost(recipe.id);
  const remaining = current.items.filter((item) => item.material.id !== itemRow.materialId);
  return {
    ok: true,
    recipe,
    product: product ?? { id: recipe.productId, name: recipe.productId },
    item: { id: itemId, materialName: material.ok ? material.value.name : itemRow.materialId },
    remaining: remaining.length,
    costsAfter: recipeUnitCost(remaining, current.technique),
  };
}

async function removeItemPreview(input: z.infer<typeof removeRecipeItemInput>): Promise<PreviewOutcome> {
  const target = await resolveRemoveItem(input);
  if (!target.ok) return { ok: false, result: target.result };
  const warnings = target.remaining === 0 ? ["La receta quedaría sin insumos: no se podrá cotizar hasta recargar items."] : [];
  return {
    ok: true,
    description: `Quitar "${target.item.materialName}" de la receta de "${target.product.name}": quedan ${target.remaining} insumo(s), costo unitario ${money(target.costsAfter.unitCost)}${warnings.length ? ` — ${warnings[0]}` : ""}`,
    preview: { recipeId: target.recipe.id, itemId: target.item.id, remainingItems: target.remaining, costsAfter: target.costsAfter, warnings },
  };
}

const removeRecipeItemInner: AgentTool<z.infer<typeof removeRecipeItemInput>> = {
  id: "removeRecipeItem",
  description: "Quita un insumo de una receta existente por id de item o por product+técnica+talle+material.",
  effect: "draft",
  inputSchema: removeRecipeItemInput,
  async handler(input) {
    const target = await resolveRemoveItem(input);
    if (!target.ok) return target.result;
    await db.delete(bomItems).where(eq(bomItems.id, target.item.id));
    return { ok: true as const, recipeId: target.recipe.id, itemId: target.item.id, remainingItems: target.remaining, costsAfter: target.costsAfter };
  },
};

export const removeRecipeItemTool = withPreviewConfirmation(removeRecipeItemInner, removeItemPreview);

export const recipeTools = [
  listProductRecipesTool,
  previewRecipeCostTool,
  upsertBomRecipeTool,
  deleteBomRecipeTool,
  addRecipeItemTool,
  removeRecipeItemTool,
] as const;
