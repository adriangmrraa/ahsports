import "server-only";

import { asc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { fabrics, garmentMolds, materials, products, sizes, techniques } from "@/db/schema";
import type { AgentTool, AgentToolContext } from "@/lib/agents/tools/types";
import { registerConfirmable, requestOperatorConfirmation } from "@/lib/telegram/confirmations";

/**
 * Shared name-or-id resolution for the operator catalog tools + the
 * preview-then-confirm gate every catalog mutation goes through.
 *
 * The model speaks human ("la remera", "sublimado", "piqué") and only
 * occasionally has a raw id. Every ref field in the new tools is a single
 * string that is resolved server-side: id lookup → exact name → substring
 * match; zero or several hits return candidates instead of a guess (the
 * disambiguation contract already used by the sales tools).
 */

export const idLike = z.string().trim().min(1).max(64);
/** A catalog ref: accepts an id OR a (partial) name — resolved server-side. */
export const nameOrId = z.string().trim().min(1).max(255);

export type Resolution<T> =
  | { ok: true; value: T }
  | { ok: false; error: "not_found" | "ambiguous"; candidates: string[] };

function candidateNames(rows: Array<{ name: string }>): string[] {
  return rows.map((row) => row.name).slice(0, 8);
}

type NamedRow = { id: string; name: string };

/**
 * id → exact-name → ilike pool. `listPool`/`listCandidates` are tiny closures
 * so each caller controls its own active/ordering policy.
 */
async function resolveNamed<T extends NamedRow>(input: {
  ref: string;
  findById: (id: string) => Promise<T[]>;
  findExact: (term: string) => Promise<T[]>;
  findPool: (term: string) => Promise<T[]>;
  listCandidates: () => Promise<T[]>;
}): Promise<Resolution<T>> {
  const term = input.ref.trim();
  const byId = await input.findById(term);
  if (byId.length === 1) return { ok: true, value: byId[0] };

  const exactRows = await input.findExact(term);
  if (exactRows.length === 1) return { ok: true, value: exactRows[0] };
  if (exactRows.length > 1) return { ok: false, error: "ambiguous", candidates: candidateNames(exactRows) };

  const pool = await input.findPool(term);
  if (pool.length === 0) {
    return { ok: false, error: "not_found", candidates: candidateNames(await input.listCandidates()) };
  }
  if (pool.length > 1) return { ok: false, error: "ambiguous", candidates: candidateNames(pool) };
  return { ok: true, value: pool[0] };
}

// ── Entity resolvers ────────────────────────────────────────────────────────

export type ProductRow = typeof products.$inferSelect;
export type MaterialRow = typeof materials.$inferSelect;
export type TechniqueRow = typeof techniques.$inferSelect;
export type FabricRow = typeof fabrics.$inferSelect;
export type SizeRow = typeof sizes.$inferSelect;

/** Product by id, SKU or fuzzy name. Operator scope: inactive rows resolve too. */
export async function resolveProduct(ref: string): Promise<Resolution<ProductRow>> {
  return resolveNamed<ProductRow>({
    ref,
    findById: (id) => db.select().from(products).where(eq(products.id, id)).limit(1),
    findExact: (term) => db.select().from(products).where(ilike(products.sku, term)).limit(2),
    findPool: async (term) => {
      const exactName = await db.select().from(products).where(ilike(products.name, term)).limit(2);
      if (exactName.length > 0) return exactName;
      return db.select().from(products).where(ilike(products.name, `%${term}%`)).limit(9);
    },
    listCandidates: () => db.select().from(products).orderBy(asc(products.name)).limit(8),
  });
}

export async function resolveMaterial(ref: string): Promise<Resolution<MaterialRow>> {
  return resolveNamed<MaterialRow>({
    ref,
    findById: (id) => db.select().from(materials).where(eq(materials.id, id)).limit(1),
    findExact: (term) => db.select().from(materials).where(ilike(materials.name, term)).limit(2),
    findPool: (term) => db.select().from(materials).where(ilike(materials.name, `%${term}%`)).limit(9),
    listCandidates: () => db.select().from(materials).orderBy(asc(materials.name)).limit(8),
  });
}

export async function resolveTechnique(ref: string): Promise<Resolution<TechniqueRow>> {
  return resolveNamed<TechniqueRow>({
    ref,
    findById: (id) => db.select().from(techniques).where(eq(techniques.id, id)).limit(1),
    findExact: (term) => db.select().from(techniques).where(ilike(techniques.name, term)).limit(2),
    findPool: (term) => db.select().from(techniques).where(ilike(techniques.name, `%${term}%`)).limit(9),
    listCandidates: () => db.select().from(techniques).orderBy(asc(techniques.name)).limit(8),
  });
}

export async function resolveFabric(ref: string): Promise<Resolution<FabricRow>> {
  return resolveNamed<FabricRow>({
    ref,
    findById: (id) => db.select().from(fabrics).where(eq(fabrics.id, id)).limit(1),
    findExact: (term) => db.select().from(fabrics).where(ilike(fabrics.name, term)).limit(2),
    findPool: (term) => db.select().from(fabrics).where(ilike(fabrics.name, `%${term}%`)).limit(9),
    listCandidates: () => db.select().from(fabrics).orderBy(asc(fabrics.name)).limit(8),
  });
}

export async function resolveMold(ref: string): Promise<Resolution<typeof garmentMolds.$inferSelect>> {
  return resolveNamed<typeof garmentMolds.$inferSelect>({
    ref,
    findById: (id) => db.select().from(garmentMolds).where(eq(garmentMolds.id, id)).limit(1),
    findExact: (term) => db.select().from(garmentMolds).where(ilike(garmentMolds.name, term)).limit(2),
    findPool: (term) => db.select().from(garmentMolds).where(ilike(garmentMolds.name, `%${term}%`)).limit(9),
    listCandidates: () => db.select().from(garmentMolds).orderBy(asc(garmentMolds.name)).limit(8),
  });
}

/** Size of a product by id or label ("M", "XL"). Empty ref → null (recipe applies to all sizes). */
export async function resolveSize(productId: string, ref: string | null | undefined): Promise<Resolution<SizeRow | null>> {
  const term = ref?.trim();
  if (!term) return { ok: true, value: null };
  const rows = await db.select().from(sizes).where(eq(sizes.productId, productId));
  const byId = rows.find((row) => row.id === term);
  if (byId) return { ok: true, value: byId };
  const matches = rows.filter((row) => row.label.toUpperCase() === term.toUpperCase());
  if (matches.length === 1) return { ok: true, value: matches[0] };
  const labels = rows.map((row) => row.label);
  if (matches.length > 1) return { ok: false, error: "ambiguous", candidates: labels };
  const fuzzy = rows.filter((row) => row.label.toUpperCase().includes(term.toUpperCase()));
  if (fuzzy.length === 1) return { ok: true, value: fuzzy[0] };
  return { ok: false, error: fuzzy.length > 1 ? "ambiguous" : "not_found", candidates: labels };
}

/** Maps a failed resolution to the tool-result shape the model reads. */
export function resolutionError(entity: string, resolution: { error: "not_found" | "ambiguous"; candidates: string[] }) {
  return {
    ok: false as const,
    error: resolution.error === "ambiguous" ? ("ambiguous" as const) : ("not_found" as const),
    message:
      resolution.error === "ambiguous"
        ? `"${entity}" es ambiguo — hay varias coincidencias. Pedí que se precise el nombre o el id.`
        : `No encontré "${entity}".`,
    candidates: resolution.candidates,
  };
}

// ── Preview-then-confirm gate ───────────────────────────────────────────────

export type PreviewOutcome =
  | { ok: true; description: string; preview?: unknown }
  | { ok: false; result: unknown };

/**
 * Catalog-mutation gate. Sibling of `withOperatorConfirmation`: the registered
 * tool NEVER writes — it validates the input, computes a human preview (what
 * changes + new computed values like unit cost), queues the pending action
 * and hands the model a `CONFIRM <token>` instruction plus the structured
 * preview. The inner tool is the only executor for the issued tokens and
 * re-resolves + re-writes at confirmation time.
 */
export function withPreviewConfirmation<TInput>(
  inner: AgentTool<TInput>,
  build: (input: TInput, context: AgentToolContext) => Promise<PreviewOutcome>,
): AgentTool<TInput> {
  registerConfirmable(inner);
  return {
    ...inner,
    description: `${inner.description} REQUIERE confirmación humana en dos pasos: la llamada valida y muestra una vista previa; solo crea la acción pendiente.`,
    async handler(input, context) {
      const built = await build(input, context);
      if (!built.ok) return built.result;
      const pending = await requestOperatorConfirmation({ tool: inner, args: input, context, description: built.description });
      return built.preview === undefined ? pending : { ...pending, preview: built.preview };
    },
  };
}
