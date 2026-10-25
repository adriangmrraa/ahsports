import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  attachments,
  configuratorDrafts,
  configuratorItems,
  designRenders,
  designRevisions,
  fabrics,
  orderLines,
  uploadSessions,
} from "@/db/schema";
import { withDbTransaction, type DbTransaction } from "@/lib/db-transaction";
import { garmentAssetRefs, normalizeGarmentConfig, type GarmentConfig, type GarmentConfigInput } from "@/configurator/model";
import {
  draftItemInputSchema,
  draftPayloadSchema,
  garmentConfigSchema,
  isDraftToken,
  type DraftPayload,
} from "@/configurator/schemas";

/**
 * Configurator draft service — the server-side state that replaces wizard
 * query params. The browser holds an opaque `cfg_…` bearer token; the table
 * stores only its SHA-256 (same pattern as upload_sessions.secretHash).
 *
 * Provenance chain: draft → item → immutable design_revisions → design_renders.
 * Revisions are append-only: saving a config never edits history.
 */

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class ConfiguratorDraftError extends Error {}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Bearer token: `cfg_` prefix + 32 random bytes as base64url (43 chars). */
export function generateDraftToken(): string {
  return `cfg_${randomBytes(32).toString("base64url")}`;
}

export type DraftItemRow = typeof configuratorItems.$inferSelect;
export type DraftRow = typeof configuratorDrafts.$inferSelect;
export type DesignRevisionRow = typeof designRevisions.$inferSelect;
export type DesignRenderRow = typeof designRenders.$inferSelect;

export type DraftWithItems = {
  draft: DraftRow;
  items: Array<DraftItemRow & { normalizedConfig: GarmentConfig }>;
};

function configsEqual(a: GarmentConfig, b: GarmentConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Tx-visible draft lookup used inside order conversion: the caller proves
 * possession of the bearer token, we resolve the live draft row.
 */
export async function findLiveDraftByTokenTx(tx: DbTransaction, token: string) {
  const rows = await tx
    .select()
    .from(configuratorDrafts)
    .where(and(eq(configuratorDrafts.tokenHash, hashToken(token)), eq(configuratorDrafts.status, "active")))
    .limit(1);
  const draft = rows[0];
  if (!draft || draft.expiresAt <= new Date()) return null;
  return draft;
}

/** Creates an empty draft; returns the only-ever-issued public token. */
export async function createConfiguratorDraftTx(
  tx: DbTransaction,
  payload: DraftPayload = {},
): Promise<{ token: string; draftId: string }> {
  const parsed = draftPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new ConfiguratorDraftError("Estado del configurador inválido");
  const token = generateDraftToken();
  const [row] = await tx
    .insert(configuratorDrafts)
    .values({ tokenHash: hashToken(token), payload: parsed.data, expiresAt: new Date(Date.now() + DRAFT_TTL_MS) })
    .returning({ id: configuratorDrafts.id });
  if (!row) throw new ConfiguratorDraftError("No se pudo crear el borrador");
  return { token, draftId: row.id };
}

export async function createConfiguratorDraft(payload: DraftPayload = {}): Promise<{ token: string; draftId: string }> {
  return withDbTransaction((tx) => createConfiguratorDraftTx(tx, payload));
}

/** Resolves a live draft by its public token. Unknown/expired → null. */
export async function getConfiguratorDraftByToken(token: unknown): Promise<DraftWithItems | null> {
  if (!isDraftToken(token)) return null;
  const rows = await db
    .select()
    .from(configuratorDrafts)
    .where(and(eq(configuratorDrafts.tokenHash, hashToken(token)), eq(configuratorDrafts.status, "active")))
    .limit(1);
  const draft = rows[0];
  if (!draft || draft.expiresAt <= new Date()) return null;
  const items = await db
    .select()
    .from(configuratorItems)
    .where(eq(configuratorItems.draftId, draft.id))
    .orderBy(asc(configuratorItems.sortOrder), asc(configuratorItems.createdAt));
  return {
    draft,
    items: items.map((item) => ({
      ...item,
      normalizedConfig: normalizeGarmentConfig(item.config as GarmentConfigInput),
    })),
  };
}

/** Updates the wizard-flow payload (contact refs, picks, sizes) on a live draft. */
export async function updateDraftPayload(token: string, patch: DraftPayload): Promise<boolean> {
  if (!isDraftToken(token)) return false;
  const parsed = draftPayloadSchema.safeParse(patch);
  if (!parsed.success) return false;
  return withDbTransaction(async (tx) => {
    const draft = await findLiveDraftByTokenTx(tx, token);
    if (!draft) return false;
    const merged = { ...(draft.payload as Record<string, unknown>), ...parsed.data };
    await tx
      .update(configuratorDrafts)
      .set({ payload: merged, updatedAt: new Date() })
      .where(eq(configuratorDrafts.id, draft.id));
    return true;
  });
}

/**
 * Re-binds the draft to a fresh upload session: files staged under the old
 * bound session move to the new one so the conversion claim still gets them.
 * Only unclaimed, client-uploaded, pending rows are moved — the draft token
 * is the ownership proof, and claimed/foreign rows never move.
 */
export async function retargetDraftUploadSession(token: string, sessionId: string): Promise<boolean> {
  if (!isDraftToken(token)) return false;
  return withDbTransaction(async (tx) => {
    const draft = await findLiveDraftByTokenTx(tx, token);
    if (!draft) return false;
    const previous = (draft.payload as DraftPayload).uploadSessionId;
    if (previous === sessionId) return true;

    const [session] = await tx
      .select({ id: uploadSessions.id, expiresAt: uploadSessions.expiresAt })
      .from(uploadSessions)
      .where(and(eq(uploadSessions.id, sessionId), eq(uploadSessions.status, "active")))
      .limit(1);
    if (!session || session.expiresAt <= new Date()) {
      throw new ConfiguratorDraftError("La sesión de carga venció. Volvé a cargar los archivos.");
    }

    if (previous) {
      await tx
        .update(attachments)
        .set({ uploadSessionId: session.id, expiresAt: session.expiresAt })
        .where(
          and(
            eq(attachments.uploadSessionId, previous),
            isNull(attachments.orderId),
            isNull(attachments.organizationId),
            eq(attachments.status, "pendiente_revision"),
            eq(attachments.uploadedByRole, "cliente"),
            isNull(attachments.deletedAt),
          ),
        );
    }

    const merged = { ...(draft.payload as Record<string, unknown>), uploadSessionId: session.id };
    await tx
      .update(configuratorDrafts)
      .set({ payload: merged, updatedAt: new Date() })
      .where(eq(configuratorDrafts.id, draft.id));
    return true;
  });
}

/**
 * Appends an immutable revision to an item. The previous revision stays
 * untouched — admin edits create history, never rewrite it.
 */
async function appendRevisionTx(
  tx: DbTransaction,
  itemId: string,
  config: GarmentConfig,
  source: "home" | "wizard" | "admin" | "system",
  createdById: string | null,
  note?: string,
): Promise<DesignRevisionRow> {
  const [row] = await tx
    .insert(designRevisions)
    .values({
      itemId,
      revisionNo: sql`(SELECT coalesce(max("revision_no"), 0) + 1 FROM ${designRevisions} WHERE "item_id" = ${itemId})`,
      config: config as unknown as Record<string, unknown>,
      source,
      note,
      createdById,
    })
    .returning();
  if (!row) throw new ConfiguratorDraftError("No se pudo registrar la revisión");
  await tx
    .update(configuratorItems)
    .set({ currentRevisionNo: row.revisionNo, updatedAt: new Date() })
    .where(eq(configuratorItems.id, itemId));
  return row;
}

/**
 * Saves a product configuration into a draft: creates the item when needed,
 * updates its config and appends a revision only when it actually changed.
 */
export async function saveDraftItem(
  token: string,
  input: unknown,
  opts: { source: "home" | "wizard" | "admin" | "system"; createdById?: string | null; note?: string },
): Promise<{ itemId: string; revisionNo: number; changed: boolean }> {
  if (!isDraftToken(token)) throw new ConfiguratorDraftError("Borrador inválido");
  const parsed = draftItemInputSchema.safeParse(input);
  if (!parsed.success) throw new ConfiguratorDraftError("Configuración inválida");
  const { productId, sortOrder } = parsed.data;
  const config = parsed.data.config as GarmentConfig;

  return withDbTransaction(async (tx) => {
    const draft = await findLiveDraftByTokenTx(tx, token);
    if (!draft) throw new ConfiguratorDraftError("El borrador venció o no existe");

    const [existing] = await tx
      .select()
      .from(configuratorItems)
      .where(and(eq(configuratorItems.draftId, draft.id), eq(configuratorItems.productId, productId)))
      .limit(1);

    if (existing) {
      const previous = normalizeGarmentConfig(existing.config as GarmentConfigInput);
      if (configsEqual(previous, config)) {
        return { itemId: existing.id, revisionNo: existing.currentRevisionNo, changed: false };
      }
      await tx
        .update(configuratorItems)
        .set({ config: config as unknown as Record<string, unknown>, updatedAt: new Date() })
        .where(eq(configuratorItems.id, existing.id));
      const rev = await appendRevisionTx(tx, existing.id, config, opts.source, opts.createdById ?? null, opts.note);
      return { itemId: existing.id, revisionNo: rev.revisionNo, changed: true };
    }

    const [item] = await tx
      .insert(configuratorItems)
      .values({
        draftId: draft.id,
        productId,
        config: config as unknown as Record<string, unknown>,
        sortOrder: sortOrder ?? 0,
      })
      .returning({ id: configuratorItems.id });
    if (!item) throw new ConfiguratorDraftError("No se pudo guardar el producto configurado");
    const rev = await appendRevisionTx(tx, item.id, config, opts.source, opts.createdById ?? null, opts.note);
    return { itemId: item.id, revisionNo: rev.revisionNo, changed: true };
  });
}

/** Full revision history of an item, newest first. Never exposes stale edits. */
export async function listItemRevisions(itemId: string): Promise<DesignRevisionRow[]> {
  return db
    .select()
    .from(designRevisions)
    .where(eq(designRevisions.itemId, itemId))
    .orderBy(desc(designRevisions.revisionNo));
}

/**
 * Admin-side revision append on an existing item (e.g. an order's design):
 * writes history without touching the item's current config unless asked.
 */
export async function appendItemRevision(
  itemId: string,
  config: unknown,
  opts: { source: "home" | "wizard" | "admin" | "system"; createdById?: string | null; note?: string; applyToItem?: boolean },
): Promise<DesignRevisionRow> {
  const parsed = garmentConfigSchema.safeParse(config);
  if (!parsed.success) throw new ConfiguratorDraftError("Configuración inválida");
  return withDbTransaction(async (tx) => {
    if (opts.applyToItem) {
      await tx
        .update(configuratorItems)
        .set({ config: parsed.data as Record<string, unknown>, updatedAt: new Date() })
        .where(eq(configuratorItems.id, itemId));
    }
    return appendRevisionTx(tx, itemId, parsed.data as GarmentConfig, opts.source, opts.createdById ?? null, opts.note);
  });
}

/**
 * Admin path — order lines carry designs that may predate any draft. Every
 * item must live under a draft container (draft_id is NOT NULL), so the first
 * admin edit creates a minimal admin-sourced draft to hold the item.
 */
export async function ensureOrderLineItemTx(
  tx: DbTransaction,
  orderLineId: string,
  productId: string,
): Promise<DraftItemRow> {
  const [existing] = await tx
    .select()
    .from(configuratorItems)
    .where(eq(configuratorItems.orderLineId, orderLineId))
    .limit(1);
  if (existing) {
    // The line's product may have been swapped after the design was created —
    // keep the item aligned so capabilities/renderers match the priced line.
    if (existing.productId !== productId) {
      await tx
        .update(configuratorItems)
        .set({ productId, updatedAt: new Date() })
        .where(eq(configuratorItems.id, existing.id));
      return { ...existing, productId };
    }
    return existing;
  }

  const { draftId } = await createConfiguratorDraftTx(tx, { productId });
  const [item] = await tx
    .insert(configuratorItems)
    .values({ draftId, productId, orderLineId })
    .returning();
  if (!item) throw new ConfiguratorDraftError("No se pudo crear el diseño del producto");
  return item;
}

/** Loads the configurator item bound to an order line, if any. */
export async function getItemByOrderLine(orderLineId: string): Promise<DraftItemRow | null> {
  const rows = await db
    .select()
    .from(configuratorItems)
    .where(eq(configuratorItems.orderLineId, orderLineId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Admin save: appends an immutable revision, applies it as the item's current
 * config, and points the order line at the new revision. Previous revisions
 * stay untouched — full audit history.
 */
export async function saveOrderLineDesign(input: {
  orderLineId: string;
  config: unknown;
  note?: string;
  createdById?: string | null;
}): Promise<{ itemId: string; revisionId: string; revisionNo: number }> {
  const parsed = garmentConfigSchema.safeParse(input.config);
  if (!parsed.success) throw new ConfiguratorDraftError("Configuración inválida");
  const config = parsed.data as GarmentConfig;

  return withDbTransaction(async (tx) => {
    const [line] = await tx
      .select({ id: orderLines.id, orderId: orderLines.orderId, productId: orderLines.productId })
      .from(orderLines)
      .where(eq(orderLines.id, input.orderLineId))
      .limit(1);
    if (!line) throw new ConfiguratorDraftError("Línea de pedido no encontrada");

    // A config can only pin attachments this order owns (admin uploads land
    // on the order) or files still staged in an upload session.
    const refs = garmentAssetRefs(config);
    if (!(await assertPlacementAssetsUsable(refs, line.orderId))) {
      throw new ConfiguratorDraftError("El diseño referencia archivos que no pertenecen a este pedido");
    }

    const item = await ensureOrderLineItemTx(tx, line.id, line.productId);
    await tx
      .update(configuratorItems)
      .set({ config: config as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(configuratorItems.id, item.id));
    const rev = await appendRevisionTx(tx, item.id, config, "admin", input.createdById ?? null, input.note);
    await tx.update(orderLines).set({ designRevisionId: rev.id }).where(eq(orderLines.id, line.id));
    return { itemId: item.id, revisionId: rev.id, revisionNo: rev.revisionNo };
  });
}

/** Items of a draft, tx-visible — used by the order conversion path. */
export async function getDraftItemsTx(tx: DbTransaction, draftId: string): Promise<DraftItemRow[]> {
  return tx
    .select()
    .from(configuratorItems)
    .where(eq(configuratorItems.draftId, draftId))
    .orderBy(asc(configuratorItems.sortOrder), asc(configuratorItems.createdAt));
}

/** Links the current revision of a draft item to an order line (conversion). */
export async function linkItemToOrderLineTx(tx: DbTransaction, itemId: string, orderLineId: string): Promise<void> {
  await tx.update(configuratorItems).set({ orderLineId, updatedAt: new Date() }).where(eq(configuratorItems.id, itemId));
  const [item] = await tx
    .select({ currentRevisionNo: configuratorItems.currentRevisionNo })
    .from(configuratorItems)
    .where(eq(configuratorItems.id, itemId))
    .limit(1);
  if (!item) return;
  const [rev] = await tx
    .select({ id: designRevisions.id })
    .from(designRevisions)
    .where(and(eq(designRevisions.itemId, itemId), eq(designRevisions.revisionNo, item.currentRevisionNo)))
    .limit(1);
  if (rev) {
    await tx.update(orderLines).set({ designRevisionId: rev.id }).where(eq(orderLines.id, orderLineId));
  }
}

/** Marks a draft as converted to an order. Idempotent. */
export async function markDraftConvertedTx(tx: DbTransaction, draftId: string, orderId: string): Promise<void> {
  await tx
    .update(configuratorDrafts)
    .set({ status: "converted", orderId, updatedAt: new Date() })
    .where(and(eq(configuratorDrafts.id, draftId), eq(configuratorDrafts.status, "active")));
}

/**
 * Registers a deterministic render artifact for a revision+view. The frame
 * itself arrives already stored through the attachments/storage pipeline;
 * this records provenance (revision, view, content hash, dimensions).
 */
export async function recordDesignRender(input: {
  revisionId: string;
  view: string;
  attachmentId?: string | null;
  storageKey?: string | null;
  contentHash?: string | null;
  width?: number | null;
  height?: number | null;
  mime?: string;
}): Promise<DesignRenderRow> {
  const [row] = await db
    .insert(designRenders)
    .values({
      revisionId: input.revisionId,
      view: input.view,
      attachmentId: input.attachmentId ?? null,
      storageKey: input.storageKey ?? null,
      contentHash: input.contentHash ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      mime: input.mime ?? "image/png",
    })
    .returning();
  if (!row) throw new ConfiguratorDraftError("No se pudo registrar el render");
  return row;
}

export async function listRevisionRenders(revisionId: string): Promise<DesignRenderRow[]> {
  return db.select().from(designRenders).where(eq(designRenders.revisionId, revisionId)).orderBy(desc(designRenders.createdAt));
}

/** Expires stale drafts and detaches nothing — revisions/renders survive. */
export async function expireStaleConfiguratorDrafts(now = new Date()): Promise<number> {
  const result = await db
    .update(configuratorDrafts)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(configuratorDrafts.status, "active"), lt(configuratorDrafts.expiresAt, now)))
    .returning({ id: configuratorDrafts.id });
  return result.length;
}

/**
 * Validates that a placement's attachment is claimable by this draft's flow:
 * staged via upload session without order, or already bound to the order.
 * Prevents a draft from pinning files it does not own.
 */
export async function assertPlacementAssetsUsable(assetRefs: string[], orderId: string | null): Promise<boolean> {
  if (assetRefs.length === 0) return true;
  const rows = await db
    .select({ id: attachments.id, orderId: attachments.orderId, uploadSessionId: attachments.uploadSessionId })
    .from(attachments)
    .where(and(inArray(attachments.id, assetRefs), isNull(attachments.deletedAt)));
  if (rows.length !== assetRefs.length) return false;
  return rows.every((r) => r.uploadSessionId !== null || (orderId !== null && r.orderId === orderId));
}

/** Maps a fabric row to its renderer preset: stored column wins over heuristic. */
export function resolveFabricVisualPreset(fabric: { name: string; visualPreset: string | null }): string {
  if (fabric.visualPreset) return fabric.visualPreset;
  const name = fabric.name.trim().toLowerCase();
  if (name.includes("sublim")) return "satin";
  if (name.includes("dry fit") || name.includes("mesh")) return "performance";
  if (name.includes("piqu") || name.includes("algod")) return "pique";
  return "performance";
}

/** Loads the catalog fabric → visual preset map used by configurator surfaces. */
export async function listFabricVisualProfiles() {
  const rows = await db.select().from(fabrics).where(eq(fabrics.active, true)).orderBy(asc(fabrics.sortOrder));
  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    sublimable: f.sublimable,
    visualPreset: resolveFabricVisualPreset(f),
  }));
}
