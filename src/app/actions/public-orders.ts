"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { attachments, uploadSessions } from "@/db/schema";
import { withDbTransaction } from "@/lib/db-transaction";
import { createOrderDraftTx, OrderDraftDomainError } from "@/lib/orders/draft-order";
import { cleanupExpiredPublicUploads, createPublicUploadSession, getLivePublicUploadSession, matchesPublicUploadSecret } from "@/lib/public-upload-sessions";
import { activeStorage, buildAttachmentPath, validateFile } from "@/lib/storage";
import { createPublicOrderSchema, publicAttachmentUploadSchema } from "@/lib/validators";

type PublicOrderFailure = { ok: false; error: string; issues?: unknown };

/** Starts a short-lived, secret-backed browser upload session for wizard step 4. */
export async function beginPublicUploadSession() {
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
