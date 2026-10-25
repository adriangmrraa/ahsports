import "server-only";

import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { fabrics, productFabrics, productTechniques, productVolumeTiers, techniques } from "@/db/schema";
import { listProductOptions } from "@/lib/product-options-store";
import type { AgentTool } from "@/lib/agents/tools/types";
import {
  nameOrId,
  resolutionError,
  resolveFabric,
  resolveProduct,
  resolveTechnique,
  withPreviewConfirmation,
  type FabricRow,
  type PreviewOutcome,
  type TechniqueRow,
} from "@/lib/telegram/catalog-resolve";

/**
 * Operator product-option tools — the per-product sell-side matrix:
 * which fabrics the product offers (+per-product delta), which decoration
 * methods (+per-product delta) and the volume discount ladder.
 *
 * Writes replace the whole collection (delete + reinsert, same semantics as
 * `PUT /api/products/[id]/options`). Previews carry the sublimation
 * invariants the quote engine enforces: a `requiresSublimableFabric` method
 * needs at least one sublimable fabric enabled, and a non-sublimable fabric
 * can never pair with sublimation.
 */

const money = (value: number) => `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── getProductOptions ───────────────────────────────────────────────────────

const productRefInput = z.object({ product: nameOrId.describe("Producto por nombre, SKU o id") });

export const getProductOptionsTool: AgentTool<z.infer<typeof productRefInput>> = {
  id: "getProductOptions",
  description:
    "Matriz de opciones de un producto: telas habilitadas con su delta, métodos de aplicación con su delta y tramos de descuento por cantidad. Es lo que define cómo cotiza el producto en el wizard y en pedidos. Solo lectura.",
  effect: "read",
  inputSchema: productRefInput,
  async handler({ product }) {
    const resolved = await resolveProduct(product);
    if (!resolved.ok) return { ...resolutionError(product, resolved), entity: "product" };
    const options = await listProductOptions(resolved.value.id);
    return {
      ok: true as const,
      product: {
        id: resolved.value.id,
        name: resolved.value.name,
        basePrice: resolved.value.basePrice,
        minOrder: resolved.value.minOrder,
      },
      ...options,
    };
  },
};

// ── Shared resolution of option entries ─────────────────────────────────────

type ResolvedFabricEntry = { fabric: FabricRow; priceDelta: number };
type ResolvedTechniqueEntry = { technique: TechniqueRow; priceDelta: number };

async function resolveFabricEntries(entries: Array<{ fabric: string; priceDelta?: number }>) {
  const resolved: ResolvedFabricEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const fabric = await resolveFabric(entry.fabric);
    if (!fabric.ok) return { ok: false as const, result: { ...resolutionError(entry.fabric, fabric), entity: "fabric" } };
    if (seen.has(fabric.value.id)) {
      return { ok: false as const, result: { ok: false as const, error: "duplicate_fabric" as const, message: `La tela "${fabric.value.name}" está repetida.` } };
    }
    seen.add(fabric.value.id);
    if (!fabric.value.active) {
      return { ok: false as const, result: { ok: false as const, error: "fabric_inactive" as const, message: `La tela "${fabric.value.name}" está inactiva — reactivala con upsertFabric o elegí otra.` } };
    }
    resolved.push({ fabric: fabric.value, priceDelta: entry.priceDelta ?? 0 });
  }
  return { ok: true as const, entries: resolved };
}

async function resolveTechniqueEntries(entries: Array<{ technique: string; priceDelta?: number }>) {
  const resolved: ResolvedTechniqueEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const technique = await resolveTechnique(entry.technique);
    if (!technique.ok) return { ok: false as const, result: { ...resolutionError(entry.technique, technique), entity: "technique" } };
    if (seen.has(technique.value.id)) {
      return { ok: false as const, result: { ok: false as const, error: "duplicate_technique" as const, message: `El método "${technique.value.name}" está repetido.` } };
    }
    seen.add(technique.value.id);
    if (!technique.value.active) {
      return { ok: false as const, result: { ok: false as const, error: "technique_inactive" as const, message: `El método "${technique.value.name}" está inactivo — reactivalo con upsertTechnique o elegí otro.` } };
    }
    resolved.push({ technique: technique.value, priceDelta: entry.priceDelta ?? 0 });
  }
  return { ok: true as const, entries: resolved };
}

/** Warnings for a proposed fabric set against the product's enabled methods. */
async function fabricSetWarnings(productId: string, entries: ResolvedFabricEntry[]): Promise<string[]> {
  const warnings: string[] = [];
  const methodRows = await db.select({ techniqueId: productTechniques.techniqueId }).from(productTechniques).where(eq(productTechniques.productId, productId));
  if (methodRows.length === 0) return warnings;
  const enabled = await db.select().from(techniques).where(eq(techniques.active, true));
  const sublimation = enabled.filter((row) => row.requiresSublimableFabric && methodRows.some((ref) => ref.techniqueId === row.id));
  if (sublimation.length === 0) return warnings;
  if (!entries.some((entry) => entry.fabric.sublimable)) {
    warnings.push(
      `NINGUNA tela sublimable en la lista y el producto tiene sublimación habilitada (${sublimation.map((row) => row.name).join(", ")}): esas combinaciones no van a cotizar.`,
    );
  }
  const nonSublimable = entries.filter((entry) => !entry.fabric.sublimable).map((entry) => entry.fabric.name);
  if (nonSublimable.length > 0) {
    warnings.push(`Telas no sublimables (${nonSublimable.join(", ")}): al elegirlas, la sublimación queda bloqueada para esa combinación.`);
  }
  return warnings;
}

/** Warnings for a proposed method set against the product's enabled fabrics. */
async function techniqueSetWarnings(productId: string, entries: ResolvedTechniqueEntry[]): Promise<string[]> {
  const sublimation = entries.filter((entry) => entry.technique.requiresSublimableFabric);
  if (sublimation.length === 0) return [];
  const fabricRows = await db.select({ fabricId: productFabrics.fabricId }).from(productFabrics).where(eq(productFabrics.productId, productId));
  if (fabricRows.length === 0) {
    // No configured fabrics → any active catalog fabric is allowed; warn only
    // if the catalog itself lacks a sublimable option.
    const anySublimable = await db.select({ id: fabrics.id }).from(fabrics).where(eq(fabrics.sublimable, true)).limit(1);
    return anySublimable.length > 0
      ? []
      : [`Sublimación habilitada (${sublimation.map((entry) => entry.technique.name).join(", ")}) pero el catálogo no tiene telas sublimables activas.`];
  }
  const linked = await db.select({ id: fabrics.id, sublimable: fabrics.sublimable }).from(fabrics).where(inArray(fabrics.id, fabricRows.map((row) => row.fabricId)));
  const hasSublimable = linked.some((fabric) => fabric.sublimable);
  return hasSublimable
    ? []
    : [`Sublimación habilitada (${sublimation.map((entry) => entry.technique.name).join(", ")}) pero el producto no tiene NINGUNA tela sublimable habilitada — agregá una con setProductFabrics o las cotizaciones fallan.`];
}

// ── setProductFabrics ───────────────────────────────────────────────────────

const setProductFabricsInput = z.object({
  product: nameOrId.describe("Producto por nombre, SKU o id"),
  fabrics: z.array(z.object({
    fabric: nameOrId.describe("Tela por nombre o id"),
    priceDelta: z.number().finite().min(-999999999).max(999999999).optional().describe("Delta de precio por unidad para ESTE producto (se suma al delta de catálogo)"),
  })).max(200).describe("Lista completa de telas habilitadas — reemplaza la actual. Vacía = el producto acepta cualquier tela activa."),
});

async function setFabricsPreview(input: z.infer<typeof setProductFabricsInput>): Promise<PreviewOutcome> {
  const product = await resolveProduct(input.product);
  if (!product.ok) return { ok: false, result: { ...resolutionError(input.product, product), entity: "product" } };
  const resolved = await resolveFabricEntries(input.fabrics);
  if (!resolved.ok) return { ok: false, result: resolved.result };
  const warnings = await fabricSetWarnings(product.value.id, resolved.entries);
  const list = resolved.entries.map((entry) => `${entry.fabric.name}${entry.fabric.sublimable ? "" : " (no sublimable)"} ${entry.priceDelta >= 0 ? "+" : ""}${money(entry.priceDelta)}`);
  return {
    ok: true,
    description: `Habilitar ${resolved.entries.length} tela(s) en "${product.value.name}": ${list.join(", ")}${warnings.length ? ` — ${warnings.join(" ")}` : ""}`,
    preview: {
      productId: product.value.id,
      fabrics: resolved.entries.map((entry) => ({
        fabricId: entry.fabric.id,
        name: entry.fabric.name,
        sublimable: entry.fabric.sublimable,
        catalogDelta: Number(entry.fabric.priceModifier),
        productDelta: entry.priceDelta,
        effectiveDelta: Number(entry.fabric.priceModifier) + entry.priceDelta,
      })),
      warnings,
    },
  };
}

const setProductFabricsInner: AgentTool<z.infer<typeof setProductFabricsInput>> = {
  id: "setProductFabrics",
  description:
    "Define qué telas ofrece un producto y el delta de precio de cada una para ese producto. Reemplaza la lista completa (la anterior se descarta).",
  effect: "draft",
  inputSchema: setProductFabricsInput,
  async handler(input) {
    const product = await resolveProduct(input.product);
    if (!product.ok) return { ...resolutionError(input.product, product), entity: "product" };
    const resolved = await resolveFabricEntries(input.fabrics);
    if (!resolved.ok) return resolved.result;
    const { withDbTransaction } = await import("@/lib/db-transaction");
    await withDbTransaction(async (tx) => {
      await tx.delete(productFabrics).where(eq(productFabrics.productId, product.value.id));
      if (resolved.entries.length > 0) {
        await tx.insert(productFabrics).values(
          resolved.entries.map((entry) => ({ productId: product.value.id, fabricId: entry.fabric.id, priceModifier: String(entry.priceDelta) })),
        );
      }
    });
    return { ok: true as const, productId: product.value.id, fabrics: resolved.entries.map((entry) => entry.fabric.id) };
  },
};

export const setProductFabricsTool = withPreviewConfirmation(setProductFabricsInner, setFabricsPreview);

// ── setProductTechniques ────────────────────────────────────────────────────

const setProductTechniquesInput = z.object({
  product: nameOrId.describe("Producto por nombre, SKU o id"),
  techniques: z.array(z.object({
    technique: nameOrId.describe("Método/técnica por nombre o id"),
    priceDelta: z.number().finite().min(-999999999).max(999999999).optional().describe("Delta de precio por unidad para ESTE producto"),
  })).max(100).describe("Lista completa de métodos habilitados — reemplaza la actual."),
});

async function setTechniquesPreview(input: z.infer<typeof setProductTechniquesInput>): Promise<PreviewOutcome> {
  const product = await resolveProduct(input.product);
  if (!product.ok) return { ok: false, result: { ...resolutionError(input.product, product), entity: "product" } };
  const resolved = await resolveTechniqueEntries(input.techniques);
  if (!resolved.ok) return { ok: false, result: resolved.result };
  const warnings = await techniqueSetWarnings(product.value.id, resolved.entries);
  const list = resolved.entries.map((entry) => `${entry.technique.name}${entry.technique.requiresSublimableFabric ? " (sublimación)" : ""} ${entry.priceDelta >= 0 ? "+" : ""}${money(entry.priceDelta)}`);
  return {
    ok: true,
    description: `Habilitar ${resolved.entries.length} método(s) en "${product.value.name}": ${list.join(", ")}${warnings.length ? ` — ${warnings.join(" ")}` : ""}`,
    preview: {
      productId: product.value.id,
      techniques: resolved.entries.map((entry) => ({
        techniqueId: entry.technique.id,
        name: entry.technique.name,
        requiresSublimableFabric: entry.technique.requiresSublimableFabric,
        productDelta: entry.priceDelta,
        costPerUnit: Number(entry.technique.costPerUnit),
      })),
      warnings,
    },
  };
}

const setProductTechniquesInner: AgentTool<z.infer<typeof setProductTechniquesInput>> = {
  id: "setProductTechniques",
  description:
    "Define qué métodos de aplicación ofrece un producto (sublimado, DTF, bordado…) y el delta de precio de cada uno para ese producto. Reemplaza la lista completa.",
  effect: "draft",
  inputSchema: setProductTechniquesInput,
  async handler(input) {
    const product = await resolveProduct(input.product);
    if (!product.ok) return { ...resolutionError(input.product, product), entity: "product" };
    const resolved = await resolveTechniqueEntries(input.techniques);
    if (!resolved.ok) return resolved.result;
    const { withDbTransaction } = await import("@/lib/db-transaction");
    await withDbTransaction(async (tx) => {
      await tx.delete(productTechniques).where(eq(productTechniques.productId, product.value.id));
      if (resolved.entries.length > 0) {
        await tx.insert(productTechniques).values(
          resolved.entries.map((entry) => ({ productId: product.value.id, techniqueId: entry.technique.id, priceModifier: String(entry.priceDelta) })),
        );
      }
    });
    return { ok: true as const, productId: product.value.id, techniques: resolved.entries.map((entry) => entry.technique.id) };
  },
};

export const setProductTechniquesTool = withPreviewConfirmation(setProductTechniquesInner, setTechniquesPreview);

// ── setProductVolumeTiers ───────────────────────────────────────────────────

const volumeTierInput = z.object({
  minQty: z.number().int().min(1).max(1000000).describe("Cantidad mínima del tramo"),
  discountPct: z.number().min(0).max(100).describe("Descuento % del tramo (0-100)"),
});

const setProductVolumeTiersInput = z.object({
  product: nameOrId.describe("Producto por nombre, SKU o id"),
  tiers: z.array(volumeTierInput).max(50).describe("Escalera de descuentos por cantidad — reemplaza la actual. Vacía = sin descuentos."),
});

type TierValidation =
  | { ok: true; tiers: Array<{ minQty: number; discountPercent: number }> }
  | { ok: false; result: unknown };

/** Sorted + deduped tier ladder; shared by preview and inner handler. */
function validateTiers(input: Array<{ minQty: number; discountPct: number }>): TierValidation {
  const sorted = [...input].sort((a, b) => a.minQty - b.minQty);
  const seen = new Set<number>();
  for (const tier of sorted) {
    if (seen.has(tier.minQty)) {
      return { ok: false, result: { ok: false as const, error: "duplicate_min_qty" as const, message: `El tramo de ${tier.minQty} unidades está repetido.` } };
    }
    seen.add(tier.minQty);
  }
  return { ok: true, tiers: sorted.map((tier) => ({ minQty: tier.minQty, discountPercent: tier.discountPct })) };
}

async function setVolumeTiersPreview(input: z.infer<typeof setProductVolumeTiersInput>): Promise<PreviewOutcome> {
  const product = await resolveProduct(input.product);
  if (!product.ok) return { ok: false, result: { ...resolutionError(input.product, product), entity: "product" } };
  const validated = validateTiers(input.tiers);
  if (!validated.ok) return { ok: false, result: validated.result };
  const basePrice = Number(product.value.basePrice);
  return {
    ok: true,
    description: `Tramos por cantidad en "${product.value.name}": ${validated.tiers.length === 0 ? "sin descuentos" : validated.tiers.map((tier) => `${tier.minQty}+ → -${tier.discountPercent}%`).join(", ")}`,
    preview: {
      productId: product.value.id,
      tiers: validated.tiers.map((tier) => ({
        ...tier,
        /** Orientation only: tier price over the bare basePrice, before fabrics/methods. */
        exampleUnitPriceOnBase: Math.round(basePrice * (1 - tier.discountPercent / 100) * 100) / 100,
      })),
      note: "exampleUnitPriceOnBase aplica el descuento solo al precio base, sin telas ni métodos.",
    },
  };
}

const setProductVolumeTiersInner: AgentTool<z.infer<typeof setProductVolumeTiersInput>> = {
  id: "setProductVolumeTiers",
  description:
    "Define la escalera de descuento por cantidad de un producto (ej: 50+ → -10%). Reemplaza los tramos actuales; se ordenan por cantidad mínima.",
  effect: "draft",
  inputSchema: setProductVolumeTiersInput,
  async handler(input) {
    const product = await resolveProduct(input.product);
    if (!product.ok) return { ...resolutionError(input.product, product), entity: "product" };
    const validated = validateTiers(input.tiers);
    if (!validated.ok) return validated.result;
    const { withDbTransaction } = await import("@/lib/db-transaction");
    await withDbTransaction(async (tx) => {
      await tx.delete(productVolumeTiers).where(eq(productVolumeTiers.productId, product.value.id));
      if (validated.tiers.length > 0) {
        await tx.insert(productVolumeTiers).values(
          validated.tiers.map((tier) => ({ productId: product.value.id, minQty: tier.minQty, discountPercent: String(tier.discountPercent) })),
        );
      }
    });
    return { ok: true as const, productId: product.value.id, tiers: validated.tiers };
  },
};

export const setProductVolumeTiersTool = withPreviewConfirmation(setProductVolumeTiersInner, setVolumeTiersPreview);

export const productOptionTools = [
  getProductOptionsTool,
  setProductFabricsTool,
  setProductTechniquesTool,
  setProductVolumeTiersTool,
] as const;
