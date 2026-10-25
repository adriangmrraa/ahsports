import "server-only";

import { and, asc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { bomItems, bomRecipes, materials, products, suppliers } from "@/db/schema";
import type { AgentTool } from "@/lib/agents/tools/types";
import {
  nameOrId,
  resolutionError,
  resolveMaterial,
  withPreviewConfirmation,
  type MaterialRow,
  type PreviewOutcome,
} from "@/lib/telegram/catalog-resolve";

/**
 * Operator material (insumo) tools.
 *
 * `materials` feeds BOM cost — a `unitPrice` change silently reprices every
 * recipe that consumes the material, so update previews list the affected
 * recipes/products. Reads are instant; writes are confirm-gated.
 */

const money = (value: number) => `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MATERIAL_UNITS = ["metro", "kilo", "unidad", "centimetro", "mililitro", "metro_cuadrado", "rollo"] as const;
const materialUnit = z.enum(MATERIAL_UNITS);

// ── Reads ───────────────────────────────────────────────────────────────────

const searchMaterialsInput = z.object({
  query: z.string().trim().min(1).max(120).optional().describe("Texto a buscar en nombre, categoría o proveedor"),
  category: z.string().trim().min(1).max(128).optional(),
  includeInactive: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const searchMaterialsTool: AgentTool<z.infer<typeof searchMaterialsInput>> = {
  id: "searchMaterials",
  description:
    "Busca insumos/materiales por nombre, categoría (tela, hilo, cierre…) o proveedor. Devuelve unidad de compra, precio por unidad y si está activo. Solo lectura.",
  effect: "read",
  inputSchema: searchMaterialsInput,
  async handler({ query, category, includeInactive, limit }) {
    const filters = [];
    if (!includeInactive) filters.push(eq(materials.active, true));
    if (category) filters.push(ilike(materials.category, `%${category}%`));
    if (query) {
      filters.push(
        or(
          ilike(materials.name, `%${query}%`),
          ilike(materials.category, `%${query}%`),
          ilike(materials.supplier, `%${query}%`),
        ),
      );
    }
    const rows = await db
      .select({
        id: materials.id,
        name: materials.name,
        category: materials.category,
        unit: materials.unit,
        unitPrice: materials.unitPrice,
        supplier: materials.supplier,
        metersPerKilo: materials.metersPerKilo,
        active: materials.active,
      })
      .from(materials)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(materials.name))
      .limit(limit ?? 15);
    return { ok: true as const, count: rows.length, materials: rows };
  },
};

const getMaterialDetailInput = z.object({ material: nameOrId.describe("Insumo por nombre o id") });

/** Recipes + products that consume this material — the reprice blast radius. */
async function materialUsage(materialId: string) {
  const itemRows = await db.select({ recipeId: bomItems.recipeId }).from(bomItems).where(eq(bomItems.materialId, materialId));
  const recipeIds = [...new Set(itemRows.map((row) => row.recipeId))];
  const usage = [];
  for (const recipeId of recipeIds) {
    const [recipe] = await db.select().from(bomRecipes).where(eq(bomRecipes.id, recipeId)).limit(1);
    if (!recipe) continue;
    const [product] = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, recipe.productId)).limit(1);
    usage.push({ recipeId, productId: recipe.productId, product: product?.name ?? recipe.productId, sizeId: recipe.sizeId, techniqueId: recipe.techniqueId });
  }
  return usage;
}

export const getMaterialDetailTool: AgentTool<z.infer<typeof getMaterialDetailInput>> = {
  id: "getMaterialDetail",
  description:
    "Ficha completa de un insumo: datos de compra (unidad, precio, proveedor, rendimiento) y en qué recetas/productos se usa — el radio de impacto si cambia el precio. Solo lectura.",
  effect: "read",
  inputSchema: getMaterialDetailInput,
  async handler({ material }) {
    const resolved = await resolveMaterial(material);
    if (!resolved.ok) return { ...resolutionError(material, resolved), entity: "material" };
    return { found: true as const, material: resolved.value, usedIn: await materialUsage(resolved.value.id) };
  },
};

// ── Shared write-side helpers ───────────────────────────────────────────────

function kiloRuleError(unit: string, metersPerKilo: number | null | undefined) {
  return unit === "kilo" && (metersPerKilo == null || metersPerKilo <= 0)
    ? "Si el insumo se compra por kilo, cargá metersPerKilo (cuántos metros rinde el kilo) mayor a 0."
    : null;
}

async function resolveSupplierName(supplierId: string | null | undefined, supplierName: string | null | undefined) {
  if (!supplierId) return { ok: true as const, supplier: supplierName ?? null, supplierId: null };
  const [sup] = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(eq(suppliers.id, supplierId)).limit(1);
  if (!sup) return { ok: false as const, result: { ok: false as const, error: "supplier_not_found" as const, message: "No encontré ese proveedor." } };
  return { ok: true as const, supplier: sup.name, supplierId: sup.id };
}

// ── createMaterial ──────────────────────────────────────────────────────────

const createMaterialInput = z.object({
  name: z.string().trim().min(1).max(255).describe("Nombre del insumo"),
  category: z.string().trim().min(1).max(128).describe("Categoría: tela, hilo, cierre, elastico, avio, tinta…"),
  unit: materialUnit.describe("Unidad de compra/consumo: metro, kilo, unidad, centimetro, mililitro, metro_cuadrado, rollo"),
  unitPrice: z.number().finite().min(0).max(1_000_000_000).describe("Precio por unidad de compra"),
  supplier: z.string().trim().max(255).nullish().describe("Nombre del proveedor (texto libre)"),
  supplierId: nameOrId.nullish().describe("Id del proveedor canónico (si existe en proveedores)"),
  width: z.number().finite().positive().nullish(),
  gramsPerMeter: z.number().finite().positive().nullish(),
  metersPerKilo: z.number().finite().positive().nullish().describe("Obligatorio si unit=kilo: metros que rinde el kilo"),
  yieldPercent: z.number().min(0).max(100).nullish().describe("Rendimiento de corte % (default 85)"),
  notes: z.string().trim().max(2000).nullish(),
  active: z.boolean().optional(),
});

function materialSummary(input: {
  name: string; category: string; unit: string; unitPrice: number;
  metersPerKilo?: number | null; supplier?: string | null; active?: boolean;
}) {
  const effectiveUnit = input.unit === "kilo" ? "metro (convertido desde kilo)" : input.unit;
  const perConsumption = input.unit === "kilo" && input.metersPerKilo ? input.unitPrice / input.metersPerKilo : input.unitPrice;
  return `${input.name} (${input.category}) — ${money(perConsumption)}/${effectiveUnit}${input.supplier ? `, proveedor ${input.supplier}` : ""}${input.active === false ? ", inactivo" : ""}`;
}

async function createMaterialPreview(input: z.infer<typeof createMaterialInput>): Promise<PreviewOutcome> {
  const kiloError = kiloRuleError(input.unit, input.metersPerKilo);
  if (kiloError) return { ok: false, result: { ok: false as const, error: "invalid_item" as const, message: kiloError } };
  const supplier = await resolveSupplierName(input.supplierId, input.supplier);
  if (!supplier.ok) return { ok: false, result: supplier.result };

  const [existing] = await db.select({ id: materials.id, name: materials.name, active: materials.active })
    .from(materials).where(ilike(materials.name, input.name.trim())).limit(1);
  const warnings = existing
    ? [`Ya existe un insumo llamado "${existing.name}"${existing.active ? "" : " (inactivo)"}: si querés editarlo, usá updateMaterial.`]
    : [];

  return {
    ok: true,
    description: `Crear insumo ${materialSummary({ ...input, supplier: supplier.supplier })}`,
    preview: { ...input, supplier: supplier.supplier, supplierId: supplier.supplierId, warnings },
  };
}

const createMaterialInner: AgentTool<z.infer<typeof createMaterialInput>> = {
  id: "createMaterial",
  description: "Da de alta un insumo/material de compra (materia prima del BOM).",
  effect: "draft",
  inputSchema: createMaterialInput,
  async handler(input) {
    const kiloError = kiloRuleError(input.unit, input.metersPerKilo);
    if (kiloError) return { ok: false as const, error: "invalid_item" as const, message: kiloError };
    const supplier = await resolveSupplierName(input.supplierId, input.supplier);
    if (!supplier.ok) return supplier.result;
    const [row] = await db.insert(materials).values({
      name: input.name,
      category: input.category,
      unit: input.unit,
      unitPrice: String(input.unitPrice),
      supplier: supplier.supplier,
      supplierId: supplier.supplierId,
      width: input.width != null ? String(input.width) : null,
      gramsPerMeter: input.gramsPerMeter != null ? String(input.gramsPerMeter) : null,
      metersPerKilo: input.metersPerKilo != null ? String(input.metersPerKilo) : null,
      yieldPercent: input.yieldPercent != null ? String(input.yieldPercent) : "85",
      notes: input.notes ?? null,
      active: input.active ?? true,
    }).returning({ id: materials.id });
    return { ok: true as const, materialId: row.id };
  },
};

export const createMaterialTool = withPreviewConfirmation(createMaterialInner, createMaterialPreview);

// ── updateMaterial ──────────────────────────────────────────────────────────

const updateMaterialInput = z.object({
  material: nameOrId.describe("Insumo por nombre o id"),
  name: z.string().trim().min(1).max(255).optional(),
  category: z.string().trim().min(1).max(128).optional(),
  unit: materialUnit.optional(),
  unitPrice: z.number().finite().min(0).max(1_000_000_000).optional(),
  supplier: z.string().trim().max(255).nullish(),
  supplierId: nameOrId.nullish(),
  width: z.number().finite().positive().nullish(),
  gramsPerMeter: z.number().finite().positive().nullish(),
  metersPerKilo: z.number().finite().positive().nullish(),
  yieldPercent: z.number().min(0).max(100).optional(),
  notes: z.string().trim().max(2000).nullish(),
  active: z.boolean().optional(),
});

type UpdatePatch = Record<string, string | number | boolean | null>;

async function buildMaterialPatch(input: z.infer<typeof updateMaterialInput>, current: MaterialRow) {
  const patch: UpdatePatch = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.category !== undefined) patch.category = input.category;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.unitPrice !== undefined) patch.unitPrice = String(input.unitPrice);
  if (input.width !== undefined) patch.width = input.width != null ? String(input.width) : null;
  if (input.gramsPerMeter !== undefined) patch.gramsPerMeter = input.gramsPerMeter != null ? String(input.gramsPerMeter) : null;
  if (input.metersPerKilo !== undefined) patch.metersPerKilo = input.metersPerKilo != null ? String(input.metersPerKilo) : null;
  if (input.yieldPercent !== undefined) patch.yieldPercent = String(input.yieldPercent);
  if (input.notes !== undefined) patch.notes = input.notes ?? null;
  if (input.active !== undefined) patch.active = input.active;
  if (input.supplier !== undefined || input.supplierId !== undefined) {
    if (input.supplierId) {
      const supplier = await resolveSupplierName(input.supplierId, null);
      if (!supplier.ok) return { errorResult: supplier.result } as const;
      patch.supplierId = supplier.supplierId;
      patch.supplier = supplier.supplier;
    } else {
      patch.supplier = input.supplier ?? null;
      if (input.supplierId === null) patch.supplierId = null;
    }
  }
  // Effective-row rule: kilo always needs metersPerKilo (PATCH is partial).
  const finalUnit = (patch.unit as string | undefined) ?? current.unit;
  const finalMetersPerKilo = patch.metersPerKilo !== undefined
    ? (patch.metersPerKilo != null ? Number(patch.metersPerKilo) : null)
    : (current.metersPerKilo != null ? Number(current.metersPerKilo) : null);
  const kiloError = kiloRuleError(finalUnit, finalMetersPerKilo);
  if (kiloError) return { errorResult: { ok: false as const, error: "invalid_item" as const, message: kiloError } } as const;
  if (Object.keys(patch).length === 0) return { errorResult: { ok: false as const, error: "nothing_to_update" as const, message: "No llegó ningún campo para actualizar." } } as const;
  return { patch } as const;
}

async function updateMaterialPreview(input: z.infer<typeof updateMaterialInput>): Promise<PreviewOutcome> {
  const resolved = await resolveMaterial(input.material);
  if (!resolved.ok) return { ok: false, result: { ...resolutionError(input.material, resolved), entity: "material" } };
  const current = resolved.value;
  const built = await buildMaterialPatch(input, current);
  if ("errorResult" in built) return { ok: false, result: built.errorResult };

  const priceChange = input.unitPrice !== undefined && Number(input.unitPrice) !== Number(current.unitPrice)
    ? { from: Number(current.unitPrice), to: input.unitPrice }
    : null;
  const affected = priceChange ? await materialUsage(current.id) : [];
  const warnings = priceChange && affected.length > 0
    ? [`El cambio de precio recalcula el costo de ${affected.length} receta(s): ${[...new Set(affected.map((row) => row.product))].slice(0, 5).join(", ")}${affected.length > 5 ? "…" : ""}.`]
    : [];

  return {
    ok: true,
    description: `Actualizar insumo "${current.name}": ${Object.keys(built.patch).join(", ")}${priceChange ? ` — precio ${money(priceChange.from)} → ${money(priceChange.to)}` : ""}${warnings.length ? ` — ${warnings[0]}` : ""}`,
    preview: { materialId: current.id, changes: built.patch, priceChange, recipesAffected: affected, warnings },
  };
}

const updateMaterialInner: AgentTool<z.infer<typeof updateMaterialInput>> = {
  id: "updateMaterial",
  description: "Edita un insumo existente (nombre, categoría, unidad, precio, proveedor, rendimiento, activo).",
  effect: "draft",
  inputSchema: updateMaterialInput,
  async handler(input) {
    const resolved = await resolveMaterial(input.material);
    if (!resolved.ok) return { ...resolutionError(input.material, resolved), entity: "material" };
    const built = await buildMaterialPatch(input, resolved.value);
    if ("errorResult" in built) return built.errorResult;
    const [row] = await db.update(materials).set(built.patch).where(eq(materials.id, resolved.value.id)).returning({ id: materials.id });
    if (!row) return { ok: false as const, error: "not_found" as const };
    return { ok: true as const, materialId: row.id, changes: built.patch };
  },
};

export const updateMaterialTool = withPreviewConfirmation(updateMaterialInner, updateMaterialPreview);

export const materialTools = [searchMaterialsTool, getMaterialDetailTool, createMaterialTool, updateMaterialTool] as const;
