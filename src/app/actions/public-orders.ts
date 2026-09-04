"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { db } from "@/db/client";
import { attachments, contacts, orderItems, orderLines, orders, organizations, sizes, users } from "@/db/schema";
import { activeStorage, buildAttachmentPath, validateFile } from "@/lib/storage";
import { attachmentKindSchema } from "@/lib/validators";
import { eq, inArray, sql } from "drizzle-orm";

/**
 * F4-11 — Sube un adjunto desde el presupuesto público (paso 4).
 * NO requiere orderId todavía: se asocia al confirmar en el paso 5
 * (UPDATE attachments SET orderId). uploadedByRole='cliente'.
 */
export async function uploadAttachmentFromPublic(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Archivo requerido" };
  }
  const kindRaw = formData.get("kind");
  const kindParsed = attachmentKindSchema.safeParse(typeof kindRaw === "string" ? kindRaw : undefined);
  if (!kindParsed.success) return { ok: false as const, error: "Tipo de adjunto inválido" };

  const valid = validateFile(file);
  if (!valid.ok) return { ok: false as const, error: valid.error };

  const originalName = file.name || "archivo";
  const relPath = buildAttachmentPath({ orderId: null, originalName });
  let stored;
  try {
    stored = await activeStorage.upload(Buffer.from(await file.arrayBuffer()), relPath, file.type);
  } catch {
    return { ok: false as const, error: "No se pudo guardar el archivo" };
  }

  const [row] = await db
    .insert(attachments)
    .values({
      kind: kindParsed.data,
      name: originalName,
      originalName,
      mimeType: file.type,
      sizeBytes: stored.size,
      url: stored.url,
      status: "pendiente_revision",
      uploadedByRole: "cliente",
    })
    .returning();
  if (!row) return { ok: false as const, error: "No se pudo registrar el adjunto" };

  revalidatePath("/presupuesto/4");
  return { ok: true as const, id: row.id, url: row.url, name: row.name, kind: row.kind };
}

interface CreatePublicOrderInput {
  type: "new" | "returning";
  name: string;
  email: string;
  phone: string;
  organizationName?: string;
  notes?: string;
  productId: string;
  productName: string;
  sizeQuantities: string; // "S:2,M:3"
  lineItems: string; // "S|Juan|10,M|*|11"
  fileIds?: string[];
}

/**
 * F4-12 — createPublicOrder: transacción completa.
 * upsert org (por name) + contact (por email) + order (borrador, publicToken
 * único) + orderLine (unitPrice 0, se cotiza luego) + orderItems (1 por prenda)
 * + asociar attachments. Anti-invención: publicToken vía randomBytes (no
 * Math.random), number es identity en DB, precios se calculan al cotizar.
 */
export async function createPublicOrder(input: CreatePublicOrderInput) {
  const { type, name, email, phone, organizationName, notes, productId, productName, sizeQuantities, lineItems, fileIds } = input;

  // 1. Organización (upsert por name — si viene).
  let organizationId: string | null = null;
  if (organizationName) {
    const existing = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.name, organizationName))
      .limit(1);
    if (existing[0]) {
      organizationId = existing[0].id;
    } else {
      const [org] = await db
        .insert(organizations)
        .values({ name: organizationName, kind: "club", notes: "Creada desde presupuesto público" })
        .returning();
      organizationId = org.id;
    }
  }

  // 2. Contact (upsert por email/phone).
  const existingContact = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(sql`${contacts.email} = ${email} or ${contacts.phone} = ${phone}`)
    .limit(1);
  let contactId: string;
  if (existingContact[0]) {
    contactId = existingContact[0].id;
  } else {
    const [contact] = await db
      .insert(contacts)
      .values({ name, email, phone, organizationId, role: type === "new" ? "capitan" : "cliente", notes })
      .returning();
    contactId = contact.id;
  }

  // 3. Order (borrador, publicToken único).
  const publicToken = randomBytes(24).toString("base64url");
  const [order] = await db
    .insert(orders)
    .values({
      publicToken,
      organizationId,
      contactId,
      status: "borrador",
      urgent: false,
      notes: notes ?? null,
    })
    .returning();

  // 4. OrderLine (unitPrice 0 hasta cotizar).
  const [line] = await db
    .insert(orderLines)
    .values({ orderId: order.id, productId, quantity: 1, unitPrice: "0", unitCost: "0", notes: productName })
    .returning();

  // 5. OrderItems (1 por prenda) + resolver sizeId por label.
  const sizeLabels = sizeQuantities.split(",").filter(Boolean).map((x) => x.split(":")[0]);
  const sizeRows = sizeLabels.length
    ? await db
        .select({ id: sizes.id, label: sizes.label })
        .from(sizes)
        .where(inArray(sizes.label, sizeLabels))
    : [];
  const sizeIdByLabel = new Map(sizeRows.map((s) => [s.label, s.id]));

  if (lineItems) {
    const rows = lineItems.split(",").map((r) => {
      const [talle, indName, indNumber] = r.split("|");
      return { talle, individualName: indName || null, individualNumber: indNumber || null };
    });
    if (rows.length) {
      await db.insert(orderItems).values(
        rows.map((r) => ({
          orderLineId: line.id,
          sizeId: sizeIdByLabel.get(r.talle) ?? null,
          individualName: r.individualName,
          individualNumber: r.individualNumber,
        })),
      );
    }
  }

  // 6. Asociar attachments (paso 4) al pedido.
  if (fileIds?.length) {
    await db.update(attachments).set({ orderId: order.id }).where(inArray(attachments.id, fileIds));
  }

  revalidatePath("/presupuesto/5");
  return { ok: true as const, orderId: order.id, publicToken, number: order.number };
}