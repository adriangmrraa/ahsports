"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { attachments, contacts, orderItems, orderLines, orders, organizations, products, sizes } from "@/db/schema";
import { withDbTransaction } from "@/lib/db-transaction";
import { activeStorage, buildAttachmentPath, validateFile } from "@/lib/storage";
import { attachmentKindSchema, createPublicOrderSchema } from "@/lib/validators";

type PublicOrderFailure = { ok: false; error: string; issues?: unknown };

/** Stages a client asset; order ownership is claimed only at confirmation. */
export async function uploadAttachmentFromPublic(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false as const, error: "Archivo requerido" };
  const kindParsed = attachmentKindSchema.safeParse(formData.get("kind"));
  if (!kindParsed.success) return { ok: false as const, error: "Tipo de adjunto inválido" };
  const valid = validateFile(file);
  if (!valid.ok) return { ok: false as const, error: valid.error };

  const originalName = file.name || "archivo";
  try {
    const stored = await activeStorage.upload(
      Buffer.from(await file.arrayBuffer()),
      buildAttachmentPath({ orderId: null, originalName }),
      file.type,
    );
    const [row] = await db.insert(attachments).values({
      kind: kindParsed.data, name: originalName, originalName, mimeType: file.type,
      sizeBytes: stored.size, url: stored.url, status: "pendiente_revision", uploadedByRole: "cliente",
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
      const [product] = await tx.select({ id: products.id, minOrder: products.minOrder })
        .from(products).where(and(eq(products.id, data.productId), eq(products.active, true))).limit(1);
      if (!product) throw new PublicOrderDomainError("El producto seleccionado ya no está disponible");

      const requestedSizeIds = data.sizeQuantities.map((entry) => entry.sizeId);
      const productSizes = await tx.select({ id: sizes.id }).from(sizes)
        .where(and(eq(sizes.productId, product.id), inArray(sizes.id, requestedSizeIds)));
      if (productSizes.length !== requestedSizeIds.length) {
        throw new PublicOrderDomainError("Uno o más talles no corresponden al producto seleccionado");
      }

      const expectedItems = data.sizeQuantities.reduce((sum, entry) => sum + entry.quantity, 0);
      if (expectedItems < product.minOrder) throw new PublicOrderDomainError(`El pedido mínimo es de ${product.minOrder} prendas`);
      if (expectedItems !== data.items.length) {
        throw new PublicOrderDomainError("Las cantidades por talle no coinciden con las prendas personalizadas");
      }
      const itemCounts = new Map<string, number>();
      for (const item of data.items) itemCounts.set(item.sizeId, (itemCounts.get(item.sizeId) ?? 0) + 1);
      for (const entry of data.sizeQuantities) {
        if (itemCounts.get(entry.sizeId) !== entry.quantity) {
          throw new PublicOrderDomainError("Las prendas personalizadas no coinciden con las cantidades por talle");
        }
      }

      let organizationId: string | null = null;
      if (data.organizationName) {
        const [existing] = await tx.select({ id: organizations.id }).from(organizations)
          .where(eq(organizations.name, data.organizationName)).limit(1);
        if (existing) organizationId = existing.id;
        else {
          const [created] = await tx.insert(organizations).values({
            name: data.organizationName, kind: "club", notes: "Creada desde presupuesto público",
          }).returning({ id: organizations.id });
          if (!created) throw new PublicOrderDomainError("No se pudo crear la organización");
          organizationId = created.id;
        }
      }

      const [existingContact] = await tx.select({ id: contacts.id, organizationId: contacts.organizationId })
        .from(contacts).where(or(eq(contacts.email, data.email), eq(contacts.phone, data.phone))).limit(1);
      let contactId: string;
      if (existingContact) {
        if (organizationId && existingContact.organizationId && existingContact.organizationId !== organizationId) {
          throw new PublicOrderDomainError("El contacto no pertenece a la organización indicada");
        }
        contactId = existingContact.id;
        organizationId ??= existingContact.organizationId;
      } else {
        if (data.type === "returning") throw new PublicOrderDomainError("No encontramos ese cliente. Iniciá una solicitud como cliente nuevo");
        const [created] = await tx.insert(contacts).values({
          name: data.name, email: data.email, phone: data.phone, organizationId, role: "cliente", notes: data.notes,
        }).returning({ id: contacts.id });
        if (!created) throw new PublicOrderDomainError("No se pudo crear el contacto");
        contactId = created.id;
      }

      const publicToken = randomBytes(24).toString("base64url");
      const [order] = await tx.insert(orders).values({
        publicToken, organizationId, contactId, status: "borrador", urgent: false, notes: data.notes ?? null,
      }).returning({ id: orders.id, number: orders.number });
      if (!order) throw new PublicOrderDomainError("No se pudo crear el pedido");
      const [line] = await tx.insert(orderLines).values({
        orderId: order.id, productId: product.id, quantity: expectedItems, unitPrice: "0", unitCost: "0",
      }).returning({ id: orderLines.id });
      if (!line) throw new PublicOrderDomainError("No se pudo crear la línea del pedido");

      await tx.insert(orderItems).values(data.items.map((item) => ({
        orderLineId: line.id, sizeId: item.sizeId,
        individualName: item.individualName || null, individualNumber: item.individualNumber || null,
      })));

      if (data.fileIds.length > 0) {
        const claimed = await tx.update(attachments).set({ orderId: order.id, organizationId })
          .where(and(inArray(attachments.id, data.fileIds), isNull(attachments.orderId), isNull(attachments.organizationId),
            eq(attachments.status, "pendiente_revision"), eq(attachments.uploadedByRole, "cliente")))
          .returning({ id: attachments.id });
        if (claimed.length !== data.fileIds.length) {
          throw new PublicOrderDomainError("Uno o más adjuntos ya no están disponibles. Volvé a cargarlos.");
        }
      }
      return { orderId: order.id, number: order.number, publicToken };
    });
    revalidatePath("/presupuesto/5");
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof PublicOrderDomainError) return { ok: false, error: error.message };
    return { ok: false, error: "No se pudo guardar tu solicitud. Intentá nuevamente." };
  }
}

class PublicOrderDomainError extends Error {}
