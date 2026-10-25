"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { attachments, uploadSessions } from "@/db/schema";
import { withDbTransaction } from "@/lib/db-transaction";
import { checkRateLimit, clientIpFromRequest } from "@/lib/infra/rate-limit";
import { createOrderDraftTx, OrderDraftDomainError } from "@/lib/orders/draft-order";
import { cleanupExpiredPublicUploads, createPublicUploadSession, getLivePublicUploadSession, matchesPublicUploadSecret } from "@/lib/public-upload-sessions";
import { activeStorage, buildAttachmentPath, validateFile } from "@/lib/storage";
import { createPublicOrderDraftSchema, createPublicOrderSchema, draftOrderDataSchema, publicAttachmentUploadSchema } from "@/lib/validators";
import {
  findLiveDraftByTokenTx,
  getDraftItemsTx,
  linkItemToOrderLineTx,
  markDraftConvertedTx,
} from "@/lib/configurator/drafts";
import { isDraftToken } from "@/configurator/schemas";

type PublicOrderFailure = { ok: false; error: string; issues?: unknown };

const WIZARD_RATE_LIMITED = { ok: false as const, error: "Demasiados intentos. Esperá un momento." };

// Per-IP limits inside one shared wizard bucket: the public presupuesto
// actions are the only unauthenticated write surface, so a scripted flood
// must never starve inbound message processing.
async function wizardRateLimited(purpose: string, limit: number): Promise<boolean> {
  const rate = await checkRateLimit(`public:wizard:${purpose}:${clientIpFromRequest({ headers: await headers() })}`, {
    bucket: "public:wizard",
    limit,
    bucketLimit: 200,
  });
  return !rate.success;
}

/** Starts a short-lived, secret-backed browser upload session for wizard step 4. */
export async function beginPublicUploadSession() {
  if (await wizardRateLimited("session", 10)) return WIZARD_RATE_LIMITED;
  try {
    await cleanupExpiredPublicUploads();
    const session = await createPublicUploadSession();
    return { ok: true as const, ...session };
  } catch {
    return { ok: false as const, error: "No se pudo preparar la carga de archivos" };
  }
}

/** Stages a client asset; order ownership is claimed only at confirmation. */
export async function uploadAttachmentFromPublic(formData: FormData, sessionInput: unknown) {
  if (await wizardRateLimited("upload", 30)) return WIZARD_RATE_LIMITED;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false as const, error: "Archivo requerido" };
  const sessionParsed = publicAttachmentUploadSchema.safeParse({
    kind: formData.get("kind"),
    ...(typeof sessionInput === "object" && sessionInput ? sessionInput : {}),
  });
  if (!sessionParsed.success) return { ok: false as const, error: "Sesión o tipo de adjunto inválido" };
  const session = await getLivePublicUploadSession(sessionParsed.data.uploadSessionId, sessionParsed.data.uploadSessionSecret);
  if (!session) return { ok: false as const, error: "La sesión de carga venció. Volvé a abrir este paso." };
  const valid = validateFile(file);
  if (!valid.ok) return { ok: false as const, error: valid.error };

  const originalName = file.name || "archivo";
  try {
    const storageKey = buildAttachmentPath({ orderId: session.id, originalName });
    const stored = await activeStorage.upload(
      Buffer.from(await file.arrayBuffer()),
      storageKey,
      file.type,
    );
    const [row] = await db.insert(attachments).values({
      kind: sessionParsed.data.kind, name: originalName, originalName, mimeType: file.type,
      sizeBytes: stored.size, url: stored.url, storageKey, uploadSessionId: session.id,
      expiresAt: session.expiresAt, status: "pendiente_revision", uploadedByRole: "cliente",
    }).returning({ id: attachments.id, url: attachments.url, name: attachments.name, kind: attachments.kind });
    if (!row) return { ok: false as const, error: "No se pudo registrar el adjunto" };
    revalidatePath("/presupuesto/4");
    return { ok: true as const, ...row };
  } catch {
    return { ok: false as const, error: "No se pudo guardar el archivo" };
  }
}

/**
 * Creates a public request atomically. Browser-supplied labels, totals, prices
 * and attachment ownership are never used as authoritative data.
 */
export async function createPublicOrder(input: unknown): Promise<
  { ok: true; orderId: string; publicToken: string; number: number } | PublicOrderFailure
> {
  if (await wizardRateLimited("order", 10)) return WIZARD_RATE_LIMITED;

  // Draft path: the client only proves possession of the configurator draft
  // token; every flow field is read server-side from the draft payload.
  const draftParsed = createPublicOrderDraftSchema.safeParse(input);
  if (draftParsed.success) return createPublicOrderFromDraft(draftParsed.data.draftToken);

  const parsed = createPublicOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisá los datos de la solicitud", issues: parsed.error.flatten() };
  const data = parsed.data;

  try {
    const result = await withDbTransaction(async (tx) => {
      const [uploadSession] = await tx.select().from(uploadSessions)
        .where(and(eq(uploadSessions.id, data.uploadSessionId), eq(uploadSessions.status, "active"))).limit(1);
      if (!uploadSession || uploadSession.expiresAt <= new Date() || !matchesPublicUploadSecret(uploadSession.secretHash, data.uploadSessionSecret)) {
        throw new PublicOrderDomainError("La sesión de carga venció o no corresponde a esta solicitud. Volvé a cargar los archivos.");
      }

      const draft = await createOrderDraftTx(tx, {
        type: data.type,
        name: data.name,
        email: data.email,
        phone: data.phone,
        organizationName: data.organizationName,
        organizationNotes: "Creada desde presupuesto público",
        notes: data.notes,
        productId: data.productId,
        fabricId: data.fabricId ?? null,
        techniqueId: data.techniqueId ?? null,
        techniqueIds: data.techniqueIds ?? null,
        sizeQuantities: data.sizeQuantities,
        items: data.items,
      });

      if (data.fileIds.length > 0) {
        const claimed = await tx.update(attachments).set({ orderId: draft.orderId, organizationId: draft.organizationId, expiresAt: null })
          .where(and(inArray(attachments.id, data.fileIds), isNull(attachments.orderId), isNull(attachments.organizationId),
            eq(attachments.uploadSessionId, uploadSession.id), eq(attachments.status, "pendiente_revision"),
            eq(attachments.uploadedByRole, "cliente"), isNull(attachments.deletedAt)))
          .returning({ id: attachments.id });
        if (claimed.length !== data.fileIds.length) {
          throw new PublicOrderDomainError("Uno o más adjuntos ya no están disponibles. Volvé a cargarlos.");
        }
      }
      await tx.update(uploadSessions).set({ status: "consumed", consumedAt: new Date() })
        .where(and(eq(uploadSessions.id, uploadSession.id), eq(uploadSessions.status, "active")));
      return { orderId: draft.orderId, number: draft.number, publicToken: draft.publicToken };
    });
    revalidatePath("/presupuesto/5");
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof OrderDraftDomainError) return { ok: false, error: error.message };
    return { ok: false, error: "No se pudo guardar tu solicitud. Intentá nuevamente." };
  }
}

class PublicOrderDomainError extends OrderDraftDomainError {}

/**
 * Order creation from a configurator draft: payload is the single source of
 * truth (PII never crossed the URL), attachments are claimed through the
 * session bound to this draft, and the item's current design revision is
 * linked onto the created order line.
 */
async function createPublicOrderFromDraft(token: string): Promise<
  { ok: true; orderId: string; publicToken: string; number: number } | PublicOrderFailure
> {
  if (!isDraftToken(token)) return { ok: false, error: "Borrador inválido" };
  try {
    const result = await withDbTransaction(async (tx) => {
      const draft = await findLiveDraftByTokenTx(tx, token);
      if (!draft) throw new PublicOrderDomainError("El diseño venció o ya fue enviado. Volvé a empezar.");

      const parsed = draftOrderDataSchema.safeParse(draft.payload);
      if (!parsed.success) throw new PublicOrderDomainError("Faltan datos en la solicitud. Revisá los pasos anteriores.");
      const data = parsed.data;

      const orderDraft = await createOrderDraftTx(tx, {
        type: data.type,
        name: data.name,
        email: data.email,
        phone: data.phone,
        organizationName: data.organizationName,
        organizationNotes: "Creada desde presupuesto público",
        notes: data.notes,
        productId: data.productId,
        fabricId: data.fabricId ?? null,
        techniqueId: data.techniqueId ?? null,
        techniqueIds: data.techniqueIds ?? null,
        sizeQuantities: data.sizeQuantities,
        items: data.lineItems.map((item) => ({
          sizeId: item.sizeId,
          individualName: item.individualName ?? null,
          individualNumber: item.individualNumber ?? null,
        })),
      });

      // Claim every pending attachment staged under the session bound to this
      // draft — the bearer token replaces the session secret as proof.
      if (data.uploadSessionId) {
        const [uploadSession] = await tx.select().from(uploadSessions)
          .where(and(eq(uploadSessions.id, data.uploadSessionId), eq(uploadSessions.status, "active"))).limit(1);
        if (!uploadSession || uploadSession.expiresAt <= new Date()) {
          throw new PublicOrderDomainError("La sesión de carga venció. Volvé a cargar los archivos.");
        }
        await tx.update(attachments)
          .set({ orderId: orderDraft.orderId, organizationId: orderDraft.organizationId, expiresAt: null })
          .where(and(eq(attachments.uploadSessionId, uploadSession.id), isNull(attachments.orderId),
            isNull(attachments.organizationId), eq(attachments.status, "pendiente_revision"),
            eq(attachments.uploadedByRole, "cliente"), isNull(attachments.deletedAt)));
        await tx.update(uploadSessions).set({ status: "consumed", consumedAt: new Date() })
          .where(and(eq(uploadSessions.id, uploadSession.id), eq(uploadSessions.status, "active")));
      }

      // Bind the current design revision of the configured product onto the
      // created line, then close the draft so it cannot be ordered twice.
      const items = await getDraftItemsTx(tx, draft.id);
      const item = items.find((i) => i.productId === data.productId) ?? items[0];
      if (item) await linkItemToOrderLineTx(tx, item.id, orderDraft.orderLineId);
      await markDraftConvertedTx(tx, draft.id, orderDraft.orderId);

      return { orderId: orderDraft.orderId, number: orderDraft.number, publicToken: orderDraft.publicToken };
    });
    revalidatePath("/presupuesto/5");
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof OrderDraftDomainError) return { ok: false, error: error.message };
    return { ok: false, error: "No se pudo guardar tu solicitud. Intentá nuevamente." };
  }
}
