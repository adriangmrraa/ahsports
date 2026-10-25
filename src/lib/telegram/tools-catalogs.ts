import "server-only";

import { asc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { fabrics, productFabrics, productTechniques, techniques } from "@/db/schema";
import { isUniqueViolation } from "@/lib/validators";
import type { AgentTool } from "@/lib/agents/tools/types";
import {
  nameOrId,
  resolutionError,
  resolveFabric,
  resolveTechnique,
  withPreviewConfirmation,
  type PreviewOutcome,
} from "@/lib/telegram/catalog-resolve";

/**
 * Operator catalog tools — techniques (métodos de personalización) and
 * fabrics (telas customer-facing). Both are option catalogs: their fields
 * (requiresSublimableFabric, sublimable, price modifiers) drive the quote
 * engine and the public wizard pickers. Upserts are confirm-gated; previews
 * warn when a change breaks the sublimation invariant.
 */

const money = (value: number) => `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Techniques ──────────────────────────────────────────────────────────────

const upsertTechniqueInput = z.object({
  technique: nameOrId.optional().describe("Técnica a editar (nombre o id). Omitir para CREAR una nueva."),
  name: z.string().trim().min(1).max(128).optional().describe("Nombre — obligatorio al crear"),
  costPerUnit: z.number().finite().min(0).max(1_000_000_000).optional().describe("Costo por prenda aplicada"),
  costPerSquareMeter: z.number().finite().min(0).max(1_000_000_000).optional().describe("Costo por m² aplicado"),
  setupCost: z.number().finite().min(0).max(1_000_000_000).optional().describe("Costo fijo por línea de pedido"),
  description: z.string().trim().max(4000).nullish(),
  requiresSublimableFabric: z.boolean().optional().describe("true si solo aplica sobre telas sublimables (poliéster)"),
  active: z.boolean().optional(),
});

type TechniqueTarget =
  | { ok: true; mode: "create" | "update"; current: typeof techniques.$inferSelect | null; affectedProducts: number; warnings: string[] }
  | { ok: false; result: unknown };

async function resolveTechniqueTarget(input: z.infer<typeof upsertTechniqueInput>): Promise<TechniqueTarget> {
  const warnings: string[] = [];
  let current: typeof techniques.$inferSelect | null = null;

  if (input.technique) {
    const resolved = await resolveTechnique(input.technique);
    if (!resolved.ok) return { ok: false, result: { ...resolutionError(input.technique, resolved), entity: "technique" } };
    current = resolved.value;
  } else {
    if (!input.name) {
      return { ok: false, result: { ok: false as const, error: "missing_name" as const, message: "Para crear una técnica necesito el nombre." } };
    }
    const [existing] = await db.select().from(techniques).where(ilike(techniques.name, input.name.trim())).limit(1);
    if (existing) {
      return {
        ok: false,
        result: {
          ok: false as const,
          error: "already_exists" as const,
          message: `Ya existe la técnica "${existing.name}". Para editarla pasá "technique".`,
          techniqueId: existing.id,
        },
      };
    }
  }

  const requiresSublimable = input.requiresSublimableFabric ?? current?.requiresSublimableFabric ?? false;
  const productRows = current
    ? await db.select({ productId: productTechniques.productId }).from(productTechniques).where(eq(productTechniques.techniqueId, current.id))
    : [];
  const affectedProducts = productRows.length;

  if (input.active === false && affectedProducts > 0) {
    warnings.push(`Al desactivarla, ${affectedProducts} producto(s) que la ofrecen dejarán de poder cotizarla.`);
  }
  if (requiresSublimable && affectedProducts > 0) {
    // Check each linked product keeps at least one sublimable fabric enabled.
    const fabricRows = await db
      .select({ productId: productFabrics.productId, sublimable: fabrics.sublimable })
      .from(productFabrics)
      .innerJoin(fabrics, eq(productFabrics.fabricId, fabrics.id));
    const offending = productRows.filter(({ productId }) => {
      const rows = fabricRows.filter((row) => row.productId === productId);
      return rows.length > 0 && !rows.some((row) => row.sublimable);
    });
    if (offending.length > 0) {
      warnings.push(`${offending.length} producto(s) la ofrecen sin ninguna tela sublimable habilitada: sus cotizaciones con esta técnica van a fallar.`);
    }
  }

  return { ok: true, mode: current ? "update" : "create", current, affectedProducts, warnings };
}

function techniqueSummary(name: string, input: z.infer<typeof upsertTechniqueInput>, current: typeof techniques.$inferSelect | null) {
  const eff = {
    costPerUnit: input.costPerUnit ?? (current ? Number(current.costPerUnit) : 0),
    costPerSquareMeter: input.costPerSquareMeter ?? (current ? Number(current.costPerSquareMeter) : 0),
    setupCost: input.setupCost ?? (current ? Number(current.setupCost) : 0),
    requiresSublimableFabric: input.requiresSublimableFabric ?? current?.requiresSublimableFabric ?? false,
    active: input.active ?? current?.active ?? true,
  };
  return `"${name}" — ${money(eff.costPerUnit)}/prenda, setup ${money(eff.setupCost)}, ${money(eff.costPerSquareMeter)}/m²${eff.requiresSublimableFabric ? ", requiere tela sublimable" : ""}${eff.active ? "" : ", INACTIVA"}`;
}

async function upsertTechniquePreview(input: z.infer<typeof upsertTechniqueInput>): Promise<PreviewOutcome> {
  const target = await resolveTechniqueTarget(input);
  if (!target.ok) return { ok: false, result: target.result };
  const name = input.name ?? target.current?.name ?? "";
  return {
    ok: true,
    description: `${target.mode === "create" ? "Crear" : "Actualizar"} técnica ${techniqueSummary(name, input, target.current)}${target.warnings.length ? ` — ${target.warnings.join(" ")}` : ""}`,
    preview: {
      mode: target.mode,
      techniqueId: target.current?.id ?? null,
      before: target.current,
      changes: target.mode === "update" ? input : undefined,
      affectedProducts: target.affectedProducts,
      warnings: target.warnings,
    },
  };
}

const upsertTechniqueInner: AgentTool<z.infer<typeof upsertTechniqueInput>> = {
  id: "upsertTechnique",
  description:
    "Crea o edita una técnica/método de personalización (estampado, sublimado, DTF, bordado…): nombre, costos por unidad/m²/setup, si exige tela sublimable y estado activo.",
  effect: "draft",
  inputSchema: upsertTechniqueInput,
  async handler(input) {
    const target = await resolveTechniqueTarget(input);
    if (!target.ok) return target.result;
    if (target.mode === "create") {
      const [row] = await db.insert(techniques).values({
        name: input.name!,
        costPerUnit: String(input.costPerUnit ?? 0),
        costPerSquareMeter: String(input.costPerSquareMeter ?? 0),
        setupCost: String(input.setupCost ?? 0),
        description: input.description ?? null,
        requiresSublimableFabric: input.requiresSublimableFabric ?? false,
        active: input.active ?? true,
      }).returning({ id: techniques.id });
      return { ok: true as const, techniqueId: row.id, created: true };
    }
    const patch: Record<string, string | boolean | null> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.costPerUnit !== undefined) patch.costPerUnit = String(input.costPerUnit);
    if (input.costPerSquareMeter !== undefined) patch.costPerSquareMeter = String(input.costPerSquareMeter);
    if (input.setupCost !== undefined) patch.setupCost = String(input.setupCost);
    if (input.description !== undefined) patch.description = input.description ?? null;
    if (input.requiresSublimableFabric !== undefined) patch.requiresSublimableFabric = input.requiresSublimableFabric;
    if (input.active !== undefined) patch.active = input.active;
    if (Object.keys(patch).length === 0) return { ok: false as const, error: "nothing_to_update" as const, message: "No llegó ningún campo para actualizar." };
    const [row] = await db.update(techniques).set(patch).where(eq(techniques.id, target.current!.id)).returning({ id: techniques.id });
    if (!row) return { ok: false as const, error: "not_found" as const };
    return { ok: true as const, techniqueId: row.id, created: false, changes: patch };
  },
};

export const upsertTechniqueTool = withPreviewConfirmation(upsertTechniqueInner, upsertTechniquePreview);

// ── Fabrics ─────────────────────────────────────────────────────────────────

const listFabricsInput = z.object({ includeInactive: z.boolean().optional() });

export const listFabricsTool: AgentTool<z.infer<typeof listFabricsInput>> = {
  id: "listFabrics",
  description: "Lista las telas del catálogo (piqué, algodón, set deportivo, dry fit…): si es sublimable, el delta de precio de catálogo y orden. Solo lectura.",
  effect: "read",
  inputSchema: listFabricsInput,
  async handler({ includeInactive }) {
    const rows = await db
      .select()
      .from(fabrics)
      .where(includeInactive ? undefined : eq(fabrics.active, true))
      .orderBy(asc(fabrics.sortOrder), asc(fabrics.name));
    return { ok: true as const, count: rows.length, fabrics: rows };
  },
};

const upsertFabricInput = z.object({
  fabric: nameOrId.optional().describe("Tela a editar (nombre o id). Omitir para CREAR una nueva."),
  name: z.string().trim().min(1).max(255).optional().describe("Nombre — obligatorio al crear"),
  sublimable: z.boolean().optional().describe("true si la tela acepta sublimación (poliéster)"),
  priceModifier: z.number().finite().min(-999999999).max(999999999).optional().describe("Delta de precio de catálogo por unidad (puede ser negativo)"),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  active: z.boolean().optional(),
});

type FabricTarget =
  | { ok: true; mode: "create" | "update"; current: typeof fabrics.$inferSelect | null; affectedProducts: number; warnings: string[] }
  | { ok: false; result: unknown };

async function resolveFabricTarget(input: z.infer<typeof upsertFabricInput>): Promise<FabricTarget> {
  const warnings: string[] = [];
  let current: typeof fabrics.$inferSelect | null = null;

  if (input.fabric) {
    const resolved = await resolveFabric(input.fabric);
    if (!resolved.ok) return { ok: false, result: { ...resolutionError(input.fabric, resolved), entity: "fabric" } };
    current = resolved.value;
  } else {
    if (!input.name) {
      return { ok: false, result: { ok: false as const, error: "missing_name" as const, message: "Para crear una tela necesito el nombre." } };
    }
  }

  const productRows = current
    ? await db.select({ productId: productFabrics.productId }).from(productFabrics).where(eq(productFabrics.fabricId, current.id))
    : [];

  const sublimable = input.sublimable ?? current?.sublimable ?? true;
  if (current && !sublimable && current.sublimable && productRows.length > 0) {
    // Turning sublimable OFF on a fabric already linked: every product that
    // also enables a sublimation technique loses a valid combination.
    const linkedTechniqueRows = await db
      .select({ productId: productTechniques.productId, requiresSublimableFabric: techniques.requiresSublimableFabric })
      .from(productTechniques)
      .innerJoin(techniques, eq(productTechniques.techniqueId, techniques.id));
    const affected = productRows.filter(({ productId }) =>
      linkedTechniqueRows.some((row) => row.productId === productId && row.requiresSublimableFabric),
    );
    if (affected.length > 0) {
      warnings.push(`${affected.length} producto(s) la combinan con técnicas de sublimación: al marcarla no-sublimable esas combinaciones dejan de cotizar.`);
    }
  }
  if (input.active === false && productRows.length > 0) {
    warnings.push(`Está habilitada en ${productRows.length} producto(s): desactivarla la oculta de los selectores.`);
  }

  return { ok: true, mode: current ? "update" : "create", current, affectedProducts: productRows.length, warnings };
}

async function upsertFabricPreview(input: z.infer<typeof upsertFabricInput>): Promise<PreviewOutcome> {
  const target = await resolveFabricTarget(input);
  if (!target.ok) return { ok: false, result: target.result };
  const name = input.name ?? target.current?.name ?? "";
  const sublimable = input.sublimable ?? target.current?.sublimable ?? true;
  const priceModifier = input.priceModifier ?? (target.current ? Number(target.current.priceModifier) : 0);
  return {
    ok: true,
    description: `${target.mode === "create" ? "Crear" : "Actualizar"} tela "${name}" — ${sublimable ? "sublimable" : "NO sublimable"}, delta ${money(priceModifier)}${target.warnings.length ? ` — ${target.warnings.join(" ")}` : ""}`,
    preview: {
      mode: target.mode,
      fabricId: target.current?.id ?? null,
      before: target.current,
      changes: target.mode === "update" ? input : undefined,
      affectedProducts: target.affectedProducts,
      warnings: target.warnings,
    },
  };
}

const upsertFabricInner: AgentTool<z.infer<typeof upsertFabricInput>> = {
  id: "upsertFabric",
  description:
    "Crea o edita una tela del catálogo (piqué, dry fit, set deportivo…): nombre, si acepta sublimación, delta de precio de catálogo y orden/estado.",
  effect: "draft",
  inputSchema: upsertFabricInput,
  async handler(input) {
    const target = await resolveFabricTarget(input);
    if (!target.ok) return target.result;
    try {
      if (target.mode === "create") {
        const [row] = await db.insert(fabrics).values({
          name: input.name!,
          sublimable: input.sublimable ?? true,
          priceModifier: String(input.priceModifier ?? 0),
          sortOrder: input.sortOrder ?? 0,
          active: input.active ?? true,
        }).returning({ id: fabrics.id });
        return { ok: true as const, fabricId: row.id, created: true };
      }
      const patch: Record<string, string | number | boolean | null> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.sublimable !== undefined) patch.sublimable = input.sublimable;
      if (input.priceModifier !== undefined) patch.priceModifier = String(input.priceModifier);
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
      if (input.active !== undefined) patch.active = input.active;
      if (Object.keys(patch).length === 0) return { ok: false as const, error: "nothing_to_update" as const, message: "No llegó ningún campo para actualizar." };
      const [row] = await db.update(fabrics).set(patch).where(eq(fabrics.id, target.current!.id)).returning({ id: fabrics.id });
      if (!row) return { ok: false as const, error: "not_found" as const };
      return { ok: true as const, fabricId: row.id, created: false, changes: patch };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { ok: false as const, error: "already_exists" as const, message: "Ya existe una tela con ese nombre." };
      }
      throw error;
    }
  },
};

export const upsertFabricTool = withPreviewConfirmation(upsertFabricInner, upsertFabricPreview);

export const catalogTools = [upsertTechniqueTool, listFabricsTool, upsertFabricTool] as const;
