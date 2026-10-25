"use server";

import { headers } from "next/headers";
import { checkRateLimit, clientIpFromRequest } from "@/lib/infra/rate-limit";
import { requireUser } from "@/lib/auth";
import {
  appendItemRevision,
  ConfiguratorDraftError,
  createConfiguratorDraft,
  getConfiguratorDraftByToken,
  getItemByOrderLine,
  recordDesignRender,
  retargetDraftUploadSession,
  saveDraftItem,
  saveOrderLineDesign,
  updateDraftPayload,
} from "@/lib/configurator/drafts";
import { draftItemInputSchema, draftPayloadSchema, isDraftToken } from "@/configurator/schemas";
import { VIEW_PRESETS } from "@/configurator/model";
import { db } from "@/db/client";
import { attachments, designRevisions, orderLines } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

/**
 * Shared server surface for the 3D configurator — one code path for home,
 * wizard and admin. Public callers hold only the opaque `cfg_…` bearer token;
 * admin calls go through requireUser so revision authorship is real.
 */

type ActionFailure = { ok: false; error: string };
type ActionOk<T> = { ok: true } & T;

async function rateLimited(purpose: string, limit: number): Promise<boolean> {
  const rate = await checkRateLimit(`configurator:${purpose}:${clientIpFromRequest({ headers: await headers() })}`, {
    bucket: "configurator",
    limit,
    bucketLimit: 200,
  });
  return !rate.success;
}

const RATE_LIMITED: ActionFailure = { ok: false, error: "Demasiados intentos. Esperá un momento." };

/** Creates a draft and returns its single-use public token. */
export async function ensureConfiguratorDraft(payload?: unknown): Promise<ActionOk<{ token: string; draftId: string }> | ActionFailure> {
  if (await rateLimited("draft", 15)) return RATE_LIMITED;
  const parsed = draftPayloadSchema.safeParse(payload ?? {});
  if (!parsed.success) return { ok: false, error: "Estado inicial inválido" };
  try {
    const { token, draftId } = await createConfiguratorDraft(parsed.data);
    return { ok: true, token, draftId };
  } catch {
    return { ok: false, error: "No se pudo iniciar el diseño" };
  }
}

/** Reads a live draft (items + normalized configs) by its public token. */
export async function loadConfiguratorDraft(token: unknown) {
  if (await rateLimited("read", 60)) return RATE_LIMITED;
  if (!isDraftToken(token)) return { ok: false as const, error: "Borrador inválido" };
  const result = await getConfiguratorDraftByToken(token);
  if (!result) return { ok: false as const, error: "El diseño venció o no existe" };
  return {
    ok: true as const,
    draftId: result.draft.id,
    status: result.draft.status,
    orderId: result.draft.orderId,
    payload: result.draft.payload,
    items: result.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      sortOrder: item.sortOrder,
      currentRevisionNo: item.currentRevisionNo,
      orderLineId: item.orderLineId,
      config: item.normalizedConfig,
    })),
  };
}

/** Saves one product's config into the draft; appends a revision on change. */
export async function saveConfiguratorItem(
  token: unknown,
  input: unknown,
  source: "home" | "wizard" | "admin" | "system" = "wizard",
): Promise<ActionOk<{ itemId: string; revisionNo: number; changed: boolean }> | ActionFailure> {
  if (await rateLimited("save", 60)) return RATE_LIMITED;
  if (!isDraftToken(token)) return { ok: false, error: "Borrador inválido" };
  const parsed = draftItemInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Configuración inválida" };
  try {
    const result = await saveDraftItem(token, parsed.data, { source });
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof ConfiguratorDraftError ? e.message : "No se pudo guardar el diseño" };
  }
}

/** Merges wizard-flow state (contact refs, picks, quantities) into the draft. */
export async function updateConfiguratorDraftPayload(token: unknown, patch: unknown): Promise<{ ok: true } | ActionFailure> {
  if (await rateLimited("patch", 60)) return RATE_LIMITED;
  if (!isDraftToken(token)) return { ok: false, error: "Borrador inválido" };
  const parsed = draftPayloadSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const updated = await updateDraftPayload(token, parsed.data);
  return updated ? { ok: true } : { ok: false, error: "El diseño venció o no existe" };
}

/**
 * Binds a fresh upload session to the draft. If the draft already pointed at
 * an earlier session (browser storage lost across reloads), its still-pending
 * attachments are re-pointed so order conversion claims them all.
 */
export async function bindDraftUploadSession(token: unknown, sessionId: unknown): Promise<{ ok: true } | ActionFailure> {
  if (await rateLimited("patch", 60)) return RATE_LIMITED;
  if (!isDraftToken(token)) return { ok: false, error: "Borrador inválido" };
  const parsed = z.string().uuid().safeParse(sessionId);
  if (!parsed.success) return { ok: false, error: "Sesión inválida" };
  try {
    const rebound = await retargetDraftUploadSession(token, parsed.data);
    if (!rebound) return { ok: false, error: "El diseño venció o no existe" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ConfiguratorDraftError ? e.message : "No se pudo vincular la sesión" };
  }
}

/** Admin-only: appends a revision to an item bound to an order. */
export async function appendDesignRevisionAdmin(
  itemId: unknown,
  config: unknown,
  note?: unknown,
): Promise<ActionOk<{ revisionId: string; revisionNo: number }> | ActionFailure> {
  const user = await requireUser();
  if (typeof itemId !== "string" || itemId.length === 0) return { ok: false, error: "Item inválido" };
  try {
    const rev = await appendItemRevision(itemId, config, {
      source: "admin",
      createdById: user.id,
      note: typeof note === "string" ? note : undefined,
      applyToItem: true,
    });
    return { ok: true, revisionId: rev.id, revisionNo: rev.revisionNo };
  } catch (e) {
    return { ok: false, error: e instanceof ConfiguratorDraftError ? e.message : "No se pudo registrar la revisión" };
  }
}

/**
 * Admin design save on an order line: creates the item under an admin draft
 * container on first edit, appends an immutable revision, and points the line
 * at it. The placement asset refs must belong to the line's order.
 */
export async function saveOrderDesignRevision(
  orderLineId: unknown,
  config: unknown,
  note?: unknown,
): Promise<ActionOk<{ itemId: string; revisionId: string; revisionNo: number }> | ActionFailure> {
  const user = await requireUser();
  const parsed = z.string().uuid().safeParse(orderLineId);
  if (!parsed.success) return { ok: false, error: "Línea inválida" };
  try {
    const result = await saveOrderLineDesign({
      orderLineId: parsed.data,
      config,
      note: typeof note === "string" ? note.slice(0, 500) : undefined,
      createdById: user.id,
    });
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof ConfiguratorDraftError ? e.message : "No se pudo guardar el diseño" };
  }
}

/**
 * Admin render registration: stores provenance (revision, view, attachment)
 * for a frame already uploaded through the order's attachment pipeline.
 */
export async function recordOrderDesignRender(
  orderLineId: unknown,
  view: unknown,
  attachmentId: unknown,
): Promise<ActionOk<{ renderId: string }> | ActionFailure> {
  await requireUser();
  const lineId = z.string().uuid().safeParse(orderLineId);
  const viewParsed = z.enum(VIEW_PRESETS).safeParse(view);
  const attachParsed = z.string().uuid().safeParse(attachmentId);
  if (!lineId.success || !viewParsed.success || !attachParsed.success) {
    return { ok: false, error: "Datos de render inválidos" };
  }

  const [line] = await db
    .select({ id: orderLines.id, orderId: orderLines.orderId })
    .from(orderLines)
    .where(eq(orderLines.id, lineId.data))
    .limit(1);
  if (!line) return { ok: false, error: "Línea de pedido no encontrada" };

  // The recorded frame must be an attachment of THIS order.
  const [attachment] = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(
      and(
        eq(attachments.id, attachParsed.data),
        eq(attachments.orderId, line.orderId),
        isNull(attachments.deletedAt),
      ),
    )
    .limit(1);
  if (!attachment) return { ok: false, error: "El archivo no pertenece a este pedido" };

  const item = await getItemByOrderLine(line.id);
  if (!item) return { ok: false, error: "La línea todavía no tiene diseño" };
  const [revision] = await db
    .select({ id: designRevisions.id })
    .from(designRevisions)
    .where(and(eq(designRevisions.itemId, item.id), eq(designRevisions.revisionNo, item.currentRevisionNo)))
    .limit(1);
  if (!revision) return { ok: false, error: "Sin revisión vigente" };

  const render = await recordDesignRender({
    revisionId: revision.id,
    view: viewParsed.data,
    attachmentId: attachment.id,
  });
  return { ok: true, renderId: render.id };
}
