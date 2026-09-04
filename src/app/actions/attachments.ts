"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { applications, attachments, orderLines, orders, organizations, products, techniques } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { activeStorage, buildAttachmentPath, validateFile } from "@/lib/storage";
import {
  applicationInputSchema,
  attachmentKindSchema,
  copyAttachmentSchema,
} from "@/lib/validators";
import { and, eq, isNull, ne } from "drizzle-orm";

type Fail = { ok: false; error: string; issues?: unknown };

function formStr(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

/**
 * F4-02 — Subida admin desde /admin/pedidos/[id]/arte.
 * Persiste vía `activeStorage`, status pendiente_revision, uploadedByRole admin.
 */
export async function uploadAttachment(
  orderId: string,
  formData: FormData,
): Promise<{ ok: true; id: string } | Fail> {
  await requireUser();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { ok: false as const, error: "Pedido no encontrado" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Archivo requerido" };
  }
  const kindParsed = attachmentKindSchema.safeParse(formStr(formData, "kind"));
  if (!kindParsed.success) {
    return { ok: false as const, error: "Tipo de adjunto inválido", issues: kindParsed.error.flatten() };
  }
  const v = validateFile(file);
  if (!v.ok) return { ok: false as const, error: v.error };

  const originalName = file.name || "archivo";
  const relPath = buildAttachmentPath({ orderId, originalName });
  let stored: { url: string; size: number };
  try {
    stored = await activeStorage.upload(Buffer.from(await file.arrayBuffer()), relPath, file.type);
  } catch {
    return { ok: false as const, error: "No se pudo guardar el archivo" };
  }

  const name = formStr(formData, "name")?.slice(0, 255) ?? originalName;
  // Neon HTTP: sin tx — insert único secuencial.
  const [row] = await db
    .insert(attachments)
    .values({
      orderId,
      organizationId: order.organizationId ?? null,
      kind: kindParsed.data,
      name,
      originalName,
      mimeType: file.type,
      sizeBytes: stored.size,
      url: stored.url,
      status: "pendiente_revision",
      uploadedByRole: "admin",
    })
    .returning({ id: attachments.id });
  if (!row) return { ok: false as const, error: "No se pudo registrar el adjunto" };

  revalidatePath(`/admin/pedidos/${orderId}/arte`);
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true as const, id: row.id };
}

/**
 * F4-05 — Alta de aplicación archivo×ubicación×técnica.
 * Valida técnica (existe + activa) y zone contra product.zones (422-equivalente).
 */
export async function addApplication(
  attachmentId: string,
  input: unknown,
): Promise<{ ok: true; id: string } | Fail> {
  await requireUser();
  const parsed = applicationInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }
  const d = parsed.data;

  const [att] = await db.select().from(attachments).where(eq(attachments.id, attachmentId)).limit(1);
  if (!att) return { ok: false as const, error: "Adjunto no encontrado" };

  if (d.techniqueId) {
    const [t] = await db.select().from(techniques).where(eq(techniques.id, d.techniqueId)).limit(1);
    if (!t) return { ok: false as const, error: "Técnica no encontrada" };
    if (!t.active) return { ok: false as const, error: "Técnica inactiva" };
  }

  let lineId: string | null = d.orderLineId ?? att.orderLineId ?? null;
  if (!lineId && att.orderId) {
    const lines = await db.select({ id: orderLines.id }).from(orderLines).where(eq(orderLines.orderId, att.orderId));
    lineId = lines[0]?.id ?? null;
  }
  if (lineId && att.orderId) {
    const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId)).limit(1);
    if (!line || line.orderId !== att.orderId) {
      return { ok: false as const, error: "Línea inválida para este pedido" };
    }
  }
  if (lineId) {
    const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId)).limit(1);
    if (line) {
      const [product] = await db.select().from(products).where(eq(products.id, line.productId)).limit(1);
      const zones = product?.zones ?? [];
      if (zones.length > 0 && !zones.includes(d.zone)) {
        return { ok: false as const, error: `Zona inválida para este producto. Zonas válidas: ${zones.join(", ")}` };
      }
    }
  }

  // Neon HTTP: sin tx — insert único secuencial.
  const [row] = await db
    .insert(applications)
    .values({
      attachmentId,
      orderLineId: lineId,
      zone: d.zone,
      view: d.view,
      techniqueId: d.techniqueId ?? null,
      widthCm: d.widthCm != null ? String(d.widthCm) : null,
      heightCm: d.heightCm != null ? String(d.heightCm) : null,
      quantity: d.quantity,
      instructions: d.instructions ?? null,
    })
    .returning({ id: applications.id });
  if (!row) return { ok: false as const, error: "No se pudo crear la aplicación" };

  if (att.orderId) {
    revalidatePath(`/admin/pedidos/${att.orderId}/arte`);
    revalidatePath(`/admin/pedidos/${att.orderId}/arte/${attachmentId}`);
  }
  return { ok: true as const, id: row.id };
}

/**
 * F4-04 — Copiar a pedido: nuevo row con MISMA url (comparte archivo, sin duplicar).
 * Solo desde biblioteca aprobada hacia pedidos abiertos de la misma org.
 */
export async function copyAttachmentToOrder(input: unknown): Promise<{ ok: true; id: string } | Fail> {
  await requireUser();
  const parsed = copyAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Datos inválidos", issues: parsed.error.flatten() };
  }
  const { attachmentId, orderId } = parsed.data;

  const [src] = await db.select().from(attachments).where(eq(attachments.id, attachmentId)).limit(1);
  if (!src) return { ok: false as const, error: "Adjunto no encontrado" };
  if (src.status !== "aprobado") {
    return { ok: false as const, error: "Solo se puede copiar archivos aprobados" };
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { ok: false as const, error: "Pedido no encontrado" };
  if (order.status === "entregado" || order.status === "cancelado") {
    return { ok: false as const, error: `No se puede copiar a un pedido ${order.status}` };
  }
  if (src.organizationId && order.organizationId !== src.organizationId) {
    return { ok: false as const, error: "El pedido debe ser de la misma organización" };
  }

  // Neon HTTP: sin tx — insert único secuencial (misma url, sin duplicar archivo).
  const [row] = await db
    .insert(attachments)
    .values({
      orderId,
      organizationId: order.organizationId ?? src.organizationId,
      kind: src.kind,
      name: src.name,
      originalName: src.originalName,
      mimeType: src.mimeType,
      sizeBytes: src.sizeBytes,
      url: src.url,
      status: "pendiente_revision",
      uploadedByRole: "admin",
    })
    .returning({ id: attachments.id });
  if (!row) return { ok: false as const, error: "No se pudo copiar el adjunto" };

  revalidatePath(`/admin/pedidos/${orderId}/arte`);
  if (src.organizationId) revalidatePath(`/admin/organizaciones/${src.organizationId}/adjuntos`);
  return { ok: true as const, id: row.id };
}

/** Pedidos abiertos de una org (destinos válidos de "Copiar a pedido"). */
export async function listOpenOrgOrders(organizationId: string) {
  await requireUser();
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) return [];
  return db
    .select({ id: orders.id, number: orders.number, status: orders.status })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, organizationId),
        ne(orders.status, "entregado"),
        ne(orders.status, "cancelado"),
      ),
    )
    .orderBy(orders.number);
}

/** Biblioteca reutilizable: orderId IS NULL + aprobados (+ kind opcional). */
export async function listOrgLibrary(organizationId: string, kind?: string) {
  await requireUser();
  const conds = [
    eq(attachments.organizationId, organizationId),
    isNull(attachments.orderId),
    eq(attachments.status, "aprobado"),
  ];
  if (kind) conds.push(eq(attachments.kind, kind as never));
  return db.select().from(attachments).where(and(...conds)).orderBy(attachments.createdAt);
}
